import { Component, input, model, signal } from '@angular/core';
import { form } from '@angular/forms/signals';
import { SettingInputDto } from '../../core/openapi';
import { OptionsListComponent } from '../../backup/options/options-list/options-list.component';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { TestState } from '../../backup/source-data/target-url-dialog/test-url/test-url';
import { RestoreFlowState } from '../restore-flow.state';
import RestoreEncryptionComponent from './restore-encryption.component';

@Component({ selector: 'app-options-list', template: '' })
class OptionsStub {
  options = model<SettingInputDto[]>([]);
  hasFreeTextSettings = input(false);
}

describe('restore temporary job encryption', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(rendered = false) {
    const response = new Subject<{ ID: string }>();
    const create = vi.fn(() => response);
    const navigate = vi.fn();
    const createState = () => ({
      encryptionForm: form(signal<{ passphrase: string | null }>({ passphrase: '' })),
      destinationTargetUrl: signal<string | null>('file:///archive'),
      destinationConnectionStringId: signal<number | null>(null),
      destinationTestSignal: signal<TestState>(null),
      isFileRestore: signal(true),
      exit: vi.fn(),
    });
    TestBed.configureTestingModule({
      imports: [RestoreEncryptionComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1Backups: create } },
        { provide: RestoreFlowState, useFactory: createState },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
      ],
    });
    if (rendered)
      TestBed.overrideComponent(RestoreEncryptionComponent, {
        remove: { imports: [OptionsListComponent] },
        add: { imports: [OptionsStub] },
      });
    else TestBed.overrideComponent(RestoreEncryptionComponent, { set: { template: '', imports: [] } });
    const state = TestBed.inject(RestoreFlowState) as unknown as ReturnType<typeof createState>;
    const fixture = TestBed.createComponent(RestoreEncryptionComponent);
    if (rendered) fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, response, create, navigate, state };
  }
  it('submits exact input text together with the saved connection reference', async () => {
    const { fixture, component, state, create } = setup(true);
    state.destinationConnectionStringId.set(7);
    const input = fixture.nativeElement.querySelector('#password') as HTMLInputElement;
    input.value = ' secret & + % password ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    component.next();
    expect(state.encryptionForm.passphrase().value()).toBe(' secret & + % password ');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          Backup: {
            TargetURL: 'file:///archive',
            ConnectionStringID: 7,
            Settings: [{ Name: '--passphrase', Value: ' secret & + % password ' }],
          },
        },
      })
    );
  });

  it('renders a null reset as empty and preserves the no-encryption payload', async () => {
    const { fixture, state, create } = setup(true);
    state.encryptionForm.passphrase().value.set('previous password');
    fixture.detectChanges();
    await fixture.whenStable();
    state.encryptionForm().reset({ passphrase: null });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#password').value).toBe('');
    expect(state.encryptionForm.passphrase().value()).toBeNull();
    const event = new Event('submit', { cancelable: true, bubbles: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          Backup: {
            TargetURL: 'file:///archive',
            Settings: [{ Name: '--no-encryption', Value: 'true' }],
          },
        },
      })
    );
  });

  it.each(['', 'secret &+ password'])(
    'creates a temporary job with the correct encryption option for %s',
    (passphrase) => {
      const { component, create, response, navigate, state } = setup();
      state.encryptionForm.passphrase().value.set(passphrase);
      component.next();
      expect(create).toHaveBeenCalledExactlyOnceWith({
        body: {
          Backup: {
            TargetURL: 'file:///archive',
            Settings: [
              passphrase ? { Name: '--passphrase', Value: passphrase } : { Name: '--no-encryption', Value: 'true' },
            ],
          },
        },
        query: { temporary: true },
      });
      expect(component.creatingTemporaryBackup()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      response.next({ ID: 'temporary-42' });
      response.complete();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/restore-draft/temporary-42']);
      expect(component.creatingTemporaryBackup()).toBe(false);
    }
  );
  it('keeps a saved destination reference when creating the temporary restore job', () => {
    const { component, create, state } = setup();
    state.destinationConnectionStringId.set(7);
    component.next();
    expect(create).toHaveBeenCalledExactlyOnceWith({
      body: {
        Backup: {
          TargetURL: 'file:///archive',
          ConnectionStringID: 7,
          Settings: [{ Name: '--no-encryption', Value: 'true' }],
        },
      },
      query: { temporary: true },
    });
  });
  it('normalizes advanced options without losing their values', () => {
    const { component, create } = setup();
    component.settings.set([
      { Name: ' retry-count ', Value: '7' },
      { Name: '--custom', Value: null },
      { Name: '--', Value: 'ignored' },
      { Name: ' ', Value: 'ignored' },
    ]);
    component.next();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          Backup: {
            TargetURL: 'file:///archive',
            Settings: [
              { Name: '--no-encryption', Value: 'true' },
              { Name: '--retry-count', Value: '7' },
              { Name: '--custom', Value: '' },
            ],
          },
        },
      })
    );
  });
  it('requires a target before entering a pending state', () => {
    const { component, state, create, navigate } = setup();
    state.destinationTargetUrl.set(null);
    expect(() => component.next()).toThrow('No target URL');
    expect(component.creatingTemporaryBackup()).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('clears pending state on failure and lets the user retry', () => {
    const { component, response, create, navigate } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.next();
    response.error(new Error('wrong password'));
    expect(component.creatingTemporaryBackup()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    const retry = new Subject<{ ID: string }>();
    create.mockReturnValue(retry);
    component.next();
    expect(create).toHaveBeenCalledTimes(2);
    retry.next({ ID: 'retry-42' });
    retry.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/restore-draft/retry-42']);
  });
  it('only hides the password for a destination explicitly reported as unencrypted', () => {
    const { component, state } = setup();
    expect(component.hasEncryptedBackup()).toBe(true);
    state.destinationTestSignal.set('testing');
    expect(component.hasEncryptedBackup()).toBe(true);
    state.destinationTestSignal.set({
      action: 'success',
      targetUrl: 'file:///archive',
      testAgain: false,
      destinationIndex: 0,
      containsEncryptedBackupFiles: false,
    });
    expect(component.hasEncryptedBackup()).toBe(false);
  });
  it.each([true, false])('returns to the correct previous flow (file restore=%s)', (isFileRestore) => {
    const { component, state, navigate } = setup();
    state.isFileRestore.set(isFileRestore);
    component.back();
    if (isFileRestore) expect(navigate).toHaveBeenCalledExactlyOnceWith(['destination'], { relativeTo: {} });
    else {
      expect(state.exit).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();
    }
  });
});
