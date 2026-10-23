import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { BackupsState } from '../../core/states/backups.state';
import ExportComponent from './export.component';

describe('ExportComponent configuration export', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup() {
    const token = new Subject<{ Token: string }>();
    const blob = new Subject<Blob>();
    const command = new Subject<{ Command: string }>();
    const issueToken = vi.fn(() => token);
    const get = vi.fn((_url: string, _options?: unknown) => blob);
    const exportCommand = vi.fn(() => command);
    const open = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [ExportComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV1AuthIssuetokenByOperation: issueToken, getApiV1BackupByIdExportCmdline: exportCommand },
        },
        { provide: HttpClient, useValue: { get } },
        { provide: PasswordGeneratorService, useValue: { calculatePasswordStrength: vi.fn(() => 4) } },
        { provide: ShipDialogService, useValue: { open } },
        { provide: ActivatedRoute, useValue: { snapshot: { params: { id: '42' } } } },
        { provide: Router, useValue: { navigate } },
        { provide: BackupsState, useValue: { backups: signal([{ Backup: { ID: '42', Name: 'Documents' } }]) } },
      ],
    }).overrideComponent(ExportComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ExportComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.exportForm.patchValue({ exportPasswords: true, encryption: false });
    const download = vi.spyOn(component, 'downloadFile').mockImplementation(() => {});
    return { component, fixture, token, blob, command, issueToken, get, exportCommand, open, navigate, download };
  }
  it('waits for approval before exporting plaintext credentials and does nothing on cancellation', () => {
    const { component, open, issueToken, get } = setup();
    component.submit();
    expect(open).toHaveBeenCalledTimes(1);
    expect(issueToken).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(issueToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(component.isExporting()).toBe(false);
  });
  it('requests a token only after plaintext export is explicitly approved', () => {
    const { component, open, issueToken } = setup();
    component.submit();
    open.mock.calls[0][1].closed(true);
    expect(issueToken).toHaveBeenCalledExactlyOnceWith({ path: { operation: 'export' } });
    expect(component.isExporting()).toBe(true);
  });
  it.each([false, true])('downloads the %s encrypted configuration with encoded token and options', (encryption) => {
    const { component, token, blob, issueToken, get, open, download, navigate } = setup();
    component.exportForm.patchValue({
      encryption,
      exportPasswords: encryption,
      password: encryption ? 'test pass&+' : '',
      repeatPassword: encryption ? 'test pass&+' : '',
    });
    component.submit();
    expect(open).not.toHaveBeenCalled();
    expect(issueToken).toHaveBeenCalledTimes(1);
    expect(get).not.toHaveBeenCalled();
    token.next({ Token: 'test-token&+/=' });
    const url = new URL(get.mock.calls[0][0] as string, 'http://localhost');
    expect(url.pathname).toBe('/api/v1/backup/42/export');
    expect(url.searchParams.get('token')).toBe('test-token&+/=');
    expect(url.searchParams.get('export-passwords')).toBe(String(encryption));
    expect(url.searchParams.get('passphrase')).toBe(encryption ? 'test pass&+' : null);
    expect(download).not.toHaveBeenCalled();
    const data = new Blob(['test configuration']);
    blob.next(data);
    blob.complete();
    token.complete();
    expect(download).toHaveBeenCalledExactlyOnceWith(
      data,
      'Documents-duplicati-config.' + (encryption ? 'aes' : 'json')
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(component.isExporting()).toBe(false);
  });
  it('clears pending state and avoids downloading or navigating after a token failure', () => {
    const { component, token, get, download, navigate } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.exportForm.patchValue({ exportPasswords: false });
    component.submit();
    token.error(new Error('token unavailable'));
    expect(component.isExporting()).toBe(false);
    expect(get).not.toHaveBeenCalled();
    expect(download).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('clears pending state after a failed configuration download', () => {
    const { component, token, blob, download, navigate } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.exportForm.patchValue({ exportPasswords: false });
    component.submit();
    token.next({ Token: 'test-token' });
    blob.error(new Error('download failed'));
    expect(component.isExporting()).toBe(false);
    expect(download).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
  it('exports a command without issuing a download token or navigating away', () => {
    const { component, fixture, command, exportCommand, issueToken, get, open, navigate } = setup();
    component.exportType.set('cmd');
    component.exportForm.patchValue({ exportPasswords: false });
    fixture.detectChanges();
    component.submit();
    expect(open).not.toHaveBeenCalled();
    expect(exportCommand).toHaveBeenCalledExactlyOnceWith({
      path: { id: '42' },
      query: { 'export-passwords': false, passphrase: '' },
    });
    command.next({ Command: 'duplicati-cli backup test-destination' });
    command.complete();
    expect(component.exportedCmd()).toBe('duplicati-cli backup test-destination');
    expect(component.isExporting()).toBe(false);
    expect(issueToken).not.toHaveBeenCalled();
    expect(get).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });
});
