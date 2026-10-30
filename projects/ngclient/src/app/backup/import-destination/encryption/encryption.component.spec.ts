import { Component, input, model, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CreateBackupDto, DuplicatiServer, SettingInputDto } from '../../../core/openapi';
import { OptionsListComponent } from '../../options/options-list/options-list.component';
import { TestState } from '../../source-data/target-url-dialog/test-url/test-url';
import { ImportDestinationState } from '../import-destination.state';
import EncryptionComponent, { createEncryptionForm } from './encryption.component';

@Component({ selector: 'app-options-list', template: '' })
class OptionsStub {
  options = model<SettingInputDto[]>([]);
  hasFreeTextSettings = input(false);
}

describe('Import destination preparation', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render() {
    const response = new Subject<CreateBackupDto>();
    const post = vi.fn(
      (_request: {
        body: { Backup: { TargetURL: string; Settings: SettingInputDto[] } };
        query: { temporary: boolean };
      }) => response
    );
    const navigate = vi.fn();
    const state = {
      encryptionForm: createEncryptionForm(),
      destinationTargetUrl: signal<string | null>('file:///archive'),
      destinationTestSignal: signal<TestState>(null),
      temporaryBackupId: signal<string | null>(null),
    };
    TestBed.configureTestingModule({
      imports: [EncryptionComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1Backups: post } },
        { provide: ImportDestinationState, useValue: state },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    TestBed.overrideComponent(EncryptionComponent, {
      remove: { imports: [OptionsListComponent] },
      add: { imports: [OptionsStub] },
    });
    const fixture = TestBed.createComponent(EncryptionComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, component, element, state, response, post, navigate };
  }

  it('submits once while pending and exposes a busy, non-editable form', () => {
    const { fixture, component, element, post } = render();
    element.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    component.next();
    fixture.detectChanges();
    expect(post).toHaveBeenCalledTimes(1);
    expect(element.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(true);
    expect(element.querySelector('form')!.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('.encryption-fields')!.hasAttribute('inert')).toBe(true);
    expect(element.querySelector('[role=status]')!.textContent).toContain('Preparing');
  });

  it('preserves the temporary-backup payload and accepts only the first result', () => {
    const { component, state, response, post, navigate } = render();
    state.encryptionForm.controls.passphrase.setValue('secret & value');
    component.settings.set([
      { Name: ' retry-delay ', Value: '5s' },
      { Name: '--number-of-retries', Value: '3' },
      { Name: '--' },
      { Name: ' ' },
    ]);
    component.next();
    expect(post).toHaveBeenCalledWith({
      body: {
        Backup: {
          TargetURL: 'file:///archive',
          Settings: [
            { Name: '--passphrase', Value: 'secret & value' },
            { Name: '--retry-delay', Value: '5s' },
            { Name: '--number-of-retries', Value: '3' },
          ],
        },
      },
      query: { temporary: true },
    });
    response.next({ ID: 'temporary-1' });
    response.next({ ID: 'late-result' });
    expect(state.temporaryBackupId()).toBe('temporary-1');
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(['../select-config'], { relativeTo: {} });
    expect(component.creatingTemporaryBackup()).toBe(false);
  });

  it('shows failures without losing input and retries with the latest values', () => {
    const { fixture, component, element, state, response, post, navigate } = render();
    state.encryptionForm.controls.passphrase.setValue('original');
    component.next();
    response.error(new Error('Request failed'));
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')!.textContent).toContain('Please try again');
    expect(state.encryptionForm.controls.passphrase.value).toBe('original');
    expect(component.creatingTemporaryBackup()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    const retry = new Subject<CreateBackupDto>();
    post.mockReturnValue(retry);
    state.encryptionForm.controls.passphrase.setValue('updated');
    component.next();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')).toBeNull();
    expect(post.mock.calls[1][0].body.Backup.Settings[0].Value).toBe('updated');
    retry.next({ ID: 'retry' });
    expect(state.temporaryBackupId()).toBe('retry');
  });

  it.each(['back', 'destroy'] as const)('ignores a late result after %s', (action) => {
    const { fixture, component, state, response, navigate } = render();
    component.next();
    if (action === 'back') component.back();
    else fixture.destroy();
    expect(response.observed).toBe(false);
    response.next({ ID: 'late' });
    expect(state.temporaryBackupId()).toBeNull();
    expect(navigate.mock.calls.some(([route]) => route[0] === '../select-config')).toBe(false);
    if (action === 'back') expect(navigate).toHaveBeenCalledWith(['../destination'], { relativeTo: {} });
  });

  it.each([undefined, null, ''])('rejects a success response without a usable ID (%s)', (ID) => {
    const { fixture, component, element, state, response, navigate } = render();
    component.next();
    response.next({ ID });
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')).not.toBeNull();
    expect(state.temporaryBackupId()).toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.creatingTemporaryBackup()).toBe(false);
  });

  it('does not submit without a target URL', () => {
    const { component, state, post } = render();
    state.destinationTargetUrl.set(null);
    expect(() => component.next()).not.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it('requires a passphrase for a destination known to contain encrypted files', () => {
    const { component, state, post } = render();
    state.destinationTestSignal.set({
      action: 'success',
      targetUrl: 'file:///archive',
      testAgain: false,
      destinationIndex: 0,
      containsEncryptedBackupFiles: true,
    });
    component.next();
    expect(post).not.toHaveBeenCalled();
    state.encryptionForm.controls.passphrase.setValue('passphrase');
    component.next();
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('keeps the unencrypted temporary-backup settings unchanged', () => {
    const { component, post } = render();
    component.next();
    expect(post.mock.calls[0][0].body.Backup.Settings).toEqual([{ Name: '--no-encryption', Value: 'true' }]);
  });

  it('recovers from a synchronous request error', () => {
    const { fixture, component, element, post } = render();
    post.mockImplementation(() => {
      throw new Error('Offline');
    });
    expect(() => component.next()).not.toThrow();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')).not.toBeNull();
    expect(component.creatingTemporaryBackup()).toBe(false);
  });

  it('unlocks the form when the request completes without a result', () => {
    const { fixture, component, element, response, navigate } = render();
    component.next();
    response.complete();
    fixture.detectChanges();
    expect(component.creatingTemporaryBackup()).toBe(false);
    expect(element.querySelector<HTMLButtonElement>('button[type=submit]')!.disabled).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
