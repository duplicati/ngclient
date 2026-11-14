import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, SystemInfoDto } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import ImportComponent from './import.component';

describe('configuration import global options', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(supported = true, direct = false) {
    const response = new Subject<{ data: unknown }>();
    const request = vi.fn((_options: { body: Record<string, unknown> }) => response);
    const open = vi.fn(
      (_component: unknown, _options: { data: { message?: string }; closed: (value: boolean) => void }) => null
    );
    const addDraftBackup = vi.fn(() => 'draft');
    TestBed.configureTestingModule({
      imports: [ImportComponent],
      providers: [
        provideRouter([]),
        { provide: DuplicatiServer, useValue: { postApiV1BackupsImport: request } },
        { provide: BackupsState, useValue: { addDraftBackup } },
        { provide: ShipAlertService, useValue: { success: vi.fn() } },
        { provide: ShipDialogService, useValue: { open } },
      ],
    });
    TestBed.inject(SysinfoState).systemInfo.set({
      APIExtensions: supported ? ['v1:backup:export-global-settings'] : [],
    } as SystemInfoDto);
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(ImportComponent);
    const component = fixture.componentInstance;
    component
      .importForm()
      .value.update((value) => ({ ...value, config: 'Y29uZmln', direct, passphrase: ' unchanged ' }));
    fixture.detectChanges();
    const choose = (global_options: string) =>
      component.importForm().value.update((value) => ({ ...value, global_options }));
    return { fixture, component, request, response, open, addDraftBackup, choose };
  }

  it('offers an explicit ignore default and explains the import-time choice', () => {
    const { fixture, request } = setup();
    expect(fixture.nativeElement.querySelector('select')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Global advanced options');
    expect(fixture.nativeElement.textContent).toContain('If the file contains');
    expect(request).not.toHaveBeenCalled();
  });

  it('sends ignore by default without changing the file or password', () => {
    const { component, request } = setup();
    component.submit();
    expect(request).toHaveBeenCalledExactlyOnceWith({
      body: expect.objectContaining({
        config: 'Y29uZmln',
        passphrase: ' unchanged ',
        direct: false,
        global_options: 'ignore',
      }),
    });
  });

  it('asks the server to merge and uses the returned job without flattening global settings locally', () => {
    const { component, choose, request, response, addDraftBackup } = setup();
    choose('merge');
    component.submit();
    expect(request.mock.calls[0][0].body['global_options']).toBe('merge');
    const data = {
      Backup: { Settings: [{ Name: '--blocksize', Value: '1MB' }] },
      GlobalSettings: [{ Name: 'blocksize', Value: '2MB' }],
    };
    response.next({ data });
    expect(addDraftBackup).toHaveBeenCalledExactlyOnceWith(data);
    expect(data.Backup.Settings).toEqual([{ Name: '--blocksize', Value: '1MB' }]);
  });

  it('does not offer or submit apply when Save now is off', () => {
    const { fixture, component, choose, request } = setup();
    choose('apply');
    component.submit();
    expect(request.mock.calls[0][0].body['global_options']).toBe('ignore');
    expect(fixture.nativeElement.textContent).not.toContain('Apply to server settings');
  });

  it('requires confirmation to apply server settings and submits the approved snapshot only once', () => {
    const { component, choose, request, open } = setup(true, true);
    choose('apply');
    component.submit();
    component.submit();
    expect(request).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    expect(component.isImporting()).toBe(true);
    const dialog = open.mock.calls[0][1];
    expect(dialog.data.message).toContain('all backups');
    component.importForm.direct().value.set(false);
    choose('merge');
    dialog.closed(true);
    dialog.closed(true);
    expect(request).toHaveBeenCalledExactlyOnceWith({
      body: expect.objectContaining({ direct: true, global_options: 'apply' }),
    });
  });

  it('cancels applying server settings without importing and allows another choice', () => {
    const { component, choose, request, open } = setup(true, true);
    choose('apply');
    component.submit();
    open.mock.calls[0][1].closed(false);
    expect(request).not.toHaveBeenCalled();
    expect(component.isImporting()).toBe(false);
    choose('ignore');
    component.submit();
    expect(request.mock.calls[0][0].body['global_options']).toBe('ignore');
  });

  it('clears an apply selection when Save now is turned off', () => {
    const { component, choose, fixture } = setup(true, true);
    choose('apply');
    fixture.detectChanges();
    component.importForm.direct().value.set(false);
    fixture.detectChanges();
    expect((component.importForm().value() as { global_options?: string }).global_options).toBe('ignore');
  });

  it('hides the choice and omits the new field for older servers', () => {
    const { component, fixture, choose, request } = setup(false);
    choose('merge');
    component.submit();
    expect(fixture.nativeElement.querySelector('select')).toBeNull();
    expect(request.mock.calls[0][0].body).not.toHaveProperty('global_options');
  });
});
