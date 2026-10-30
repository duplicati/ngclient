import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServer } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import BackupComponent from './backup.component';
import { BackupState } from './backup.state';

@Component({ selector: 'app-status-bar', template: '' })
class StatusStub {}
@Component({ selector: 'test-editor-page', template: '<p>Editor page</p>' })
class PageStub {}

describe('existing backup editor save action', () => {
  let addedInert = false;
  beforeAll(() => {
    // jsdom does not expose this native property yet; Chromium covers actual inert behavior.
    if (!('inert' in HTMLElement.prototype)) {
      addedInert = true;
      Object.defineProperty(HTMLElement.prototype, 'inert', {
        configurable: true,
        get(this: HTMLElement) {
          return this.hasAttribute('inert');
        },
        set(this: HTMLElement, value: boolean) {
          this.toggleAttribute('inert', value);
        },
      });
    }
  });
  afterAll(() => {
    if (addedInert) Reflect.deleteProperty(HTMLElement.prototype, 'inert');
  });
  afterEach(() => TestBed.resetTestingModule());
  async function setup({ isNew = false, isDraft = false, loading = false, step = 'general' } = {}) {
    const state = {
      backupId: signal(isNew ? 'new' : '42'),
      isNew: signal(isNew),
      isDraft: signal(isDraft),
      backupName: signal('Editable backup'),
      saveState: signal({ status: 'idle' }),
      isSubmitting: signal(false),
      finishedLoading: signal(!loading),
      submit: vi.fn(),
      validateBeforeSubmit: vi.fn(() => ''),
    };
    const children = ['general', 'source-data', 'destination', 'schedule', 'options'].map((path) => ({
      path,
      component: PageStub,
    }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'backup/:id', component: BackupComponent, children },
          { path: 'backup-draft/:id', component: BackupComponent, children },
        ]),
        { provide: DuplicatiServer, useValue: {} },
        { provide: BackupsState, useValue: { draftBackups: signal([]) } },
      ],
    });
    TestBed.overrideComponent(BackupComponent, {
      remove: { imports: [StatusBarComponent], providers: [BackupState] },
      add: { imports: [StatusStub], providers: [{ provide: BackupState, useValue: state }] },
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(
      '/' + (isDraft ? 'backup-draft' : 'backup') + '/' + state.backupId() + '/' + step,
      BackupComponent
    );
    const button = () => harness.routeNativeElement?.querySelector<HTMLButtonElement>('.editor-save');
    return { state, harness, component, button };
  }
  it('renders an explicit native save button and saves without leaving', async () => {
    const { state, button } = await setup();
    expect(button()?.type).toBe('button');
    expect(button()?.textContent).toContain('Save changes');
    button()!.click();
    expect(state.validateBeforeSubmit).toHaveBeenCalledOnce();
    expect(state.submit).toHaveBeenCalledExactlyOnceWith(true);
  });
  it.each([{ isNew: true }, { isDraft: true }])(
    'keeps creation/draft flow without this action: %j',
    async (options) => {
      const { state, component, button } = await setup(options);
      expect(button()).toBeNull();
      component.saveChanges();
      expect(state.submit).not.toHaveBeenCalled();
      expect(state.validateBeforeSubmit).not.toHaveBeenCalled();
    }
  );
  it('disables and ignores save before loading finishes', async () => {
    const { state, component, button } = await setup({ loading: true });
    expect(button()?.disabled).toBe(true);
    component.saveChanges();
    expect(state.submit).not.toHaveBeenCalled();
    expect(state.validateBeforeSubmit).not.toHaveBeenCalled();
  });
  it('disables and ignores duplicate submission while pending', async () => {
    const { state, component, harness, button } = await setup();
    state.isSubmitting.set(true);
    harness.detectChanges();
    expect(button()?.disabled).toBe(true);
    component.saveChanges();
    expect(state.validateBeforeSubmit).not.toHaveBeenCalled();
    expect(state.submit).not.toHaveBeenCalled();
  });
  it.each([
    ['general', 'general'],
    ['destination', 'destination'],
    ['source', 'source-data'],
  ])('routes %s validation to %s before saving', async (validation, path) => {
    const { state, component, harness } = await setup({ step: 'options' });
    state.validateBeforeSubmit.mockReturnValue(validation);
    component.saveChanges();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/backup/42/' + path);
    expect(state.submit).not.toHaveBeenCalled();
  });
});
