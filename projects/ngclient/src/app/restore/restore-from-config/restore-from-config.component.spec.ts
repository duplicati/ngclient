import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ImportBackupInputDto } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import RestoreFromConfigComponent from './restore-from-config.component';

describe('restore from configuration Signal Form', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(syncRestore = false) {
    const imported = new Subject<any>();
    const importConfig = vi.fn((_request: { body: ImportBackupInputDto }) => imported);
    const create = vi.fn(() => of({ ID: 'temporary-42' }));
    const error = vi.fn();
    TestBed.configureTestingModule({
      imports: [RestoreFromConfigComponent],
      providers: [
        provideRouter([]),
        { provide: DuplicatiServer, useValue: { postApiV1BackupsImport: importConfig, postApiV1Backups: create } },
        { provide: ShipAlertService, useValue: { error } },
        { provide: SysinfoState, useValue: { hasSyncRestore: signal(syncRestore) } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(RestoreFromConfigComponent);
    fixture.componentInstance.isSecureFile.set(true);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, imported, importConfig, create, error, navigate };
  }

  it('exposes Back as a home link without importing or creating a job', () => {
    const { fixture, component, importConfig, create } = setup();
    const back = fixture.nativeElement.querySelector('header .actions > :first-child') as HTMLElement;
    expect(back.tagName).toBe('A');
    expect(back.getAttribute('href')).toBe('/');
    component.importForm.passphrase().value.set('keep input');
    component.isRestoring.set(true);
    fixture.detectChanges();
    expect(back.getAttribute('href')).toBe('/');
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    expect(importConfig).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(component.importForm.passphrase().value()).toBe('keep input');
  });

  it('submits the exact rendered passphrase and default import options, then creates a temporary job', () => {
    const { fixture, component, imported, importConfig, create, navigate } = setup();
    component.importForm.config().value.set('AAH/');
    const input = fixture.nativeElement.querySelector('input[type=password]') as HTMLInputElement;
    input.value = ' secret & + % password ';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement).click();
    expect(importConfig).toHaveBeenCalledExactlyOnceWith({
      body: {
        config: 'AAH/',
        cmdline: false,
        importMetadata: false,
        direct: false,
        passphrase: ' secret & + % password ',
      },
    });
    fixture.detectChanges();
    expect(component.isRestoring()).toBe(true);
    expect(fixture.nativeElement.querySelector('button[type=submit]').disabled).toBe(true);
    const backup = { Name: 'restored', OperationType: 'Backup', TargetURL: 'file:///archive' };
    imported.next({ data: { Backup: backup } });
    imported.complete();
    expect(create).toHaveBeenCalledExactlyOnceWith({ body: { Backup: backup }, query: { temporary: true } });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/restore-draft', 'temporary-42']);
    expect(component.isRestoring()).toBe(false);
  });

  it('renders a null passphrase as empty without changing its submitted value', () => {
    const { fixture, component, importConfig } = setup();
    component.importForm.passphrase().value.set(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input[type=password]').value).toBe('');
    component.submit();
    expect(importConfig.mock.calls[0][0].body.passphrase).toBeNull();
  });

  it('reads configuration bytes as base64 without changing the passphrase', async () => {
    const { component } = setup();
    component.importForm.passphrase().value.set('retained');
    const file = new File([new Uint8Array([0, 1, 255])], 'config.aes');
    component.onFileDropped({ target: { files: { item: () => file } } } as unknown as Event);
    await vi.waitFor(() => expect(component.importForm.config().value()).toBe('AAH/'));
    expect(component.importForm.passphrase().value()).toBe('retained');
    expect(component.isSecureFile()).toBe(true);
  });

  it.each([false, true])('preserves the Sync restore capability gate (%s)', (supported) => {
    const { component, imported, create, error, navigate } = setup(supported);
    component.submit();
    imported.next({ data: { Backup: { OperationType: 'Sync' } } });
    imported.complete();
    if (supported) expect(create).toHaveBeenCalledOnce();
    else {
      expect(create).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(error).toHaveBeenCalledWith('Sync jobs cannot be restored.');
    }
    expect(component.isRestoring()).toBe(false);
  });

  it('keeps input after an import error and permits retry', () => {
    const { component, imported, importConfig, error } = setup();
    component.importForm.passphrase().value.set('keep me');
    component.submit();
    imported.error(new Error('incorrect password'));
    expect(error).toHaveBeenCalledWith('incorrect password');
    expect(component.isRestoring()).toBe(false);
    expect(component.importForm.passphrase().value()).toBe('keep me');
    importConfig.mockReturnValue(of({ data: { Backup: {} } }) as any);
    component.submit();
    expect(importConfig).toHaveBeenCalledTimes(2);
  });

  it('reports temporary job creation failure and clears pending state', () => {
    const { component, imported, create, error, navigate } = setup();
    create.mockReturnValue(throwError(() => new Error('temporary creation failed')));
    component.submit();
    imported.next({ data: { Backup: {} } });
    expect(error).toHaveBeenCalledWith('temporary creation failed');
    expect(component.isRestoring()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
