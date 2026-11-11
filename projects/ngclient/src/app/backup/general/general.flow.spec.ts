import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { By } from '@angular/platform-browser';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { TimespanLiteralsService } from '../../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';
import GeneralComponent from './general.component';

describe('GeneralComponent editing contracts', () => {
  let fixture: ComponentFixture<GeneralComponent>;
  let state: BackupState;
  const update = vi.fn((_request: unknown) => of({}));
  const open = vi.fn();
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function setup(mode: 'new' | 'edit' | 'draft' = 'new', encrypted = false) {
    TestBed.configureTestingModule({
      imports: [GeneralComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: ShipDialogService, useValue: { open } },
        { provide: DuplicatiServer, useValue: { putApiV1BackupById: update } },
        {
          provide: PasswordGeneratorService,
          useValue: { calculatePasswordStrength: () => 4, generate: () => 'generated-secret' },
        },
        { provide: TimespanLiteralsService, useValue: {} },
        {
          provide: SysinfoState,
          useValue: {
            hasSyncMode: signal(true),
            systemInfo: signal({ EncryptionModules: [{ Key: 'aes', DisplayName: 'AES' }] }),
          },
        },
        { provide: ServerSettingsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });
    state = TestBed.inject(BackupState);
    state.backupId.set(mode === 'new' ? 'new' : 'string');
    state.isDraft.set(mode === 'draft');
    state.generalForm.patchValue({ name: '', encryption: encrypted ? 'aes' : '-', password: '', repeatPassword: '' });
    fixture = TestBed.createComponent(GeneralComponent);
    await settle();
  }
  async function input(selector: string, value: string) {
    const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    return element;
  }
  const submit = () => fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;

  it('updates name and description in the saved form and keeps required-name validation', async () => {
    await setup();
    expect(submit().disabled).toBe(true);
    await input('input[placeholder="Your backup name"]', 'Documents');
    await input('#backupDescription', 'Daily documents');
    expect(state.generalForm.value).toMatchObject({ name: 'Documents', description: 'Daily documents' });
    expect(submit().disabled).toBe(false);
    await input('input[placeholder="Your backup name"]', '');
    expect(submit().disabled).toBe(true);
  });

  it('preserves dirty, touched and disabled states on the name control', async () => {
    await setup();
    const name = await input('input[placeholder="Your backup name"]', 'Documents');
    name.dispatchEvent(new Event('blur'));
    await settle();
    expect(state.generalForm.controls.name.dirty).toBe(true);
    expect(state.generalForm.controls.name.touched).toBe(true);
    expect(name.classList.contains('ng-dirty')).toBe(true);
    expect(name.classList.contains('ng-touched')).toBe(true);
    state.generalForm.controls.name.disable();
    await settle();
    expect(name.disabled).toBe(true);
    state.generalForm.controls.name.enable();
    await settle();
    expect(name.disabled).toBe(false);
  });

  it('reflects externally loaded values and resets after the view is created', async () => {
    await setup();
    state.generalForm.patchValue({ name: 'Loaded', description: 'From server', password: 'saved' });
    await settle();
    expect(fixture.nativeElement.querySelector('input[placeholder="Your backup name"]').value).toBe('Loaded');
    expect(fixture.nativeElement.querySelector('#backupDescription').value).toBe('From server');
    state.generalForm.reset({ operationType: 'Backup' });
    await settle();
    expect(fixture.nativeElement.querySelector('input[placeholder="Your backup name"]').value).toBe('');
    expect(state.generalForm.controls.name.pristine).toBe(true);
    expect(state.generalForm.controls.name.value).toBeNull();
    expect(state.generalForm.controls.description.value).toBeNull();
    expect(submit().disabled).toBe(true);
  });

  it('keeps encrypted password validation and the mismatch message', async () => {
    await setup('new', true);
    await input('input[placeholder="Your backup name"]', 'Encrypted');
    expect(submit().disabled).toBe(true);
    await input('#password', 'first');
    await input('#repeatPassword', 'second');
    expect(fixture.nativeElement.textContent).toContain('Passwords do not match');
    expect(state.validateBeforeSubmit()).toBe('general');
    await input('#repeatPassword', 'first');
    expect(fixture.nativeElement.textContent).not.toContain('Passwords do not match');
    expect(state.mapFormsToSettings()).toEqual([
      { Name: 'encryption-module', Value: 'aes' },
      { Name: 'passphrase', Value: 'first' },
    ]);
  });

  it('keeps generated-password copy acknowledgement before continuing', async () => {
    await setup('new', true);
    await input('input[placeholder="Your backup name"]', 'Encrypted');
    fixture.componentInstance.generatePassword();
    await settle();
    expect(state.generalForm.controls.password.value).toBe('generated-secret');
    expect(state.generalForm.controls.repeatPassword.value).toBe('generated-secret');
    expect(submit().disabled).toBe(true);
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    await fixture.componentInstance.copyPassword();
    await settle();
    expect(writeText).toHaveBeenCalledWith('generated-secret');
    expect(submit().disabled).toBe(false);
  });

  it('changes operation mode through the real toggle and preserves backup encryption values', async () => {
    await setup('new', true);
    await input('input[placeholder="Your backup name"]', 'Sync job');
    await input('#password', 'secret');
    await input('#repeatPassword', 'secret');
    (fixture.nativeElement.querySelector('button[value=Sync]') as HTMLButtonElement).click();
    await settle();
    expect(state.generalForm.controls.operationType.value).toBe('Sync');
    expect(fixture.nativeElement.querySelector('sh-select')).toBeNull();
    expect(state.mapFormsToSettings()).toEqual([{ Name: '--no-encryption', Value: 'True' }]);
    (fixture.nativeElement.querySelector('button[value=Backup]') as HTMLButtonElement).click();
    await settle();
    expect(state.generalForm.controls.operationType.value).toBe('Backup');
    expect(state.generalForm.controls.password.value).toBe('secret');
    expect(fixture.nativeElement.querySelector('#password').value).toBe('secret');
  });

  it('keeps existing encryption hidden and autosaves a name edit with the same encryption DTO', async () => {
    await setup('edit', true);
    state.generalForm.patchValue({ password: 'existing-secret', repeatPassword: 'existing-secret' });
    state.setTargetUrl('file:///backup');
    state.sourceDataForm.controls.path.setValue('/documents');
    state.mapScheduleToForm(null);
    await settle();
    expect(fixture.nativeElement.querySelector('sh-select')).toBeNull();
    await input('input[placeholder="Your backup name"]', 'Renamed');
    fixture.componentInstance.next();
    expect(update).toHaveBeenCalledOnce();
    expect(update.mock.calls[0]?.[0]).toMatchObject({
      path: { id: 'string' },
      body: {
        Backup: {
          Name: 'Renamed',
          Settings: [
            { Name: 'encryption-module', Value: 'aes' },
            { Name: 'passphrase', Value: 'existing-secret' },
          ],
        },
      },
    });
  });

  it('allows a draft encryption selection to change without rewriting other form values', async () => {
    await setup('draft', true);
    state.generalForm.patchValue({ name: 'Draft', password: 'secret', repeatPassword: 'secret' });
    state.generalForm.controls.encryption.setValue('-');
    await settle();
    expect(fixture.nativeElement.querySelector('sh-select')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#password')).toBeNull();
    expect(state.generalForm.controls.name.value).toBe('Draft');
    expect(state.mapFormsToSettings()).toEqual([{ Name: '--no-encryption', Value: 'True' }]);
  });
  it('propagates real Ship UI encryption selections into the saved form', async () => {
    await setup('draft', true);
    const select = fixture.debugElement.query(By.directive(ShipSelect)).componentInstance as ShipSelect;
    select.toggleOptionByIndex(0);
    await settle();
    expect(state.generalForm.controls.encryption.value).toBe('-');
    expect(fixture.nativeElement.querySelector('#password')).toBeNull();
    select.toggleOptionByIndex(1);
    await settle();
    expect(state.generalForm.controls.encryption.value).toBe('aes');
    expect(fixture.nativeElement.querySelector('#password')).not.toBeNull();
  });

  it('prevents native form navigation on submit', async () => {
    await setup();
    await input('input[placeholder="Your backup name"]', 'Documents');
    const event = new Event('submit', { cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
