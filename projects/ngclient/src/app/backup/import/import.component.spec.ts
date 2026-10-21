import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import ImportComponent from './import.component';

describe('ImportComponent configuration submission', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(direct = false) {
    const response = new Subject<{ data: unknown }>();
    const request = vi.fn(() => response);
    const addDraftBackup = vi.fn(() => 'draft-id');
    const navigate = vi.fn();
    const success = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [ImportComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1BackupsImport: request } },
        { provide: BackupsState, useValue: { addDraftBackup } },
        { provide: Router, useValue: { navigate } },
        { provide: ShipAlertService, useValue: { success } },
        { provide: ShipDialogService, useValue: { open } },
      ],
    }).overrideComponent(ImportComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ImportComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.importForm.patchValue({
      config: 'dGVzdCBjb25maWc=',
      cmdline: false,
      import_metadata: true,
      direct,
      passphrase: 'test pass&+',
    });
    return { component, response, request, addDraftBackup, navigate, success, open };
  }
  it('sends config, metadata and passphrase unchanged and waits before navigating', () => {
    const { component, request, navigate } = setup();
    component.submit();
    expect(request).toHaveBeenCalledExactlyOnceWith({
      body: {
        config: 'dGVzdCBjb25maWc=',
        cmdline: false,
        import_metadata: true,
        direct: false,
        passphrase: 'test pass&+',
      },
    });
    expect(component.isImporting()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
  it('opens an editable draft from the returned configuration without claiming a direct import', () => {
    const { component, response, addDraftBackup, navigate, success } = setup();
    const data = { Backup: { ID: null, Name: 'Imported backup' }, CreatedByVersion: 'test' };
    component.submit();
    response.next({ data });
    response.complete();
    expect(addDraftBackup).toHaveBeenCalledExactlyOnceWith(data);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup-draft', 'draft-id']);
    expect(success).not.toHaveBeenCalled();
    expect(component.isImporting()).toBe(false);
  });
  it('finishes a direct import without creating a second draft', () => {
    const { component, response, addDraftBackup, navigate, success } = setup(true);
    component.submit();
    response.next({ data: null });
    response.complete();
    expect(addDraftBackup).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(component.isImporting()).toBe(false);
  });
  it('preserves command-line mode instead of interpreting the config locally', () => {
    const { component, request } = setup();
    component.importForm.patchValue({ cmdline: true, import_metadata: false });
    component.submit();
    expect(request).toHaveBeenCalledWith({ body: expect.objectContaining({ cmdline: true, import_metadata: false }) });
  });
  it('reports an API failure, clears pending state and permits a retry', () => {
    const { component, response, request, addDraftBackup, navigate, success, open } = setup();
    component.submit();
    response.error(new Error('invalid passphrase'));
    expect(component.isImporting()).toBe(false);
    expect(open.mock.calls[0][1].data.message).toBe('invalid passphrase');
    expect(addDraftBackup).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(success).not.toHaveBeenCalled();
    const retry = new Subject<{ data: unknown }>();
    request.mockReturnValue(retry);
    component.submit();
    expect(request).toHaveBeenCalledTimes(2);
    retry.next({ data: { Backup: { Name: 'Imported' } } });
    retry.complete();
    expect(component.isImporting()).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup-draft', 'draft-id']);
  });
});
