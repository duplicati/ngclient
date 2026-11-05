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

class ControlledFileReader {
  static instances: ControlledFileReader[] = [];
  static LOADING = 1;
  result: ArrayBuffer | string | null = null;
  readyState = 0;
  onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onerror: ((event: ProgressEvent<FileReader>) => void) | null = null;
  onabort: ((event: ProgressEvent<FileReader>) => void) | null = null;
  constructor() {
    ControlledFileReader.instances.push(this);
  }
  readAsArrayBuffer(_file: Blob) {
    this.readyState = 1;
  }
  event() {
    return { target: this } as unknown as ProgressEvent<FileReader>;
  }
  abort = vi.fn(() => {
    this.readyState = 2;
    this.onabort?.(this.event());
  });
  complete(value: string | Uint8Array) {
    const bytes = typeof value === 'string' ? new TextEncoder().encode(value) : value;
    this.result = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    this.readyState = 2;
    this.onload?.(this.event());
  }
  fail() {
    this.readyState = 2;
    this.onerror?.(this.event());
  }
}

describe('configuration file read lifecycle', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });
  function render() {
    ControlledFileReader.instances = [];
    vi.stubGlobal('FileReader', ControlledFileReader);
    const request = vi.fn(() => new Subject<unknown>());
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [ImportComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1BackupsImport: request } },
        { provide: BackupsState, useValue: { addDraftBackup: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ShipAlertService, useValue: { success: vi.fn() } },
        { provide: ShipDialogService, useValue: { open } },
      ],
    }).overrideComponent(ImportComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ImportComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, request, open };
  }
  const file = (name = 'config.json', type = 'application/json') => new File(['placeholder'], name, { type });
  const json = '{"Backup":{"Name":"文書"}}';

  it.each(['application/json', 'application/octet-stream'])(
    'preserves UTF-8 JSON bytes independently of MIME %s',
    (mime) => {
      const { component } = render();
      component.onFileDropped([file('config.json', mime)]);
      ControlledFileReader.instances[0].complete(json);
      expect(component.importForm.controls.config.value).toBe('eyJCYWNrdXAiOnsiTmFtZSI6IuaWh+abuCJ9fQ==');
      expect(component.isSecureFile()).toBe(false);
      expect(component.isValid()).toBe(true);
    }
  );

  it('recognizes the AES signature even when MIME reports JSON', () => {
    const { component } = render();
    component.onFileDropped([file()]);
    ControlledFileReader.instances[0].complete(new Uint8Array([65, 69, 83, 2, 0, 1]));
    expect(component.isSecureFile()).toBe(true);
    expect(component.isValid()).toBe(true);
  });

  it('clears the old payload and cannot submit while a replacement is reading', () => {
    const { component, request } = render();
    component.onFileDropped([file('old.json')]);
    ControlledFileReader.instances[0].complete(json);
    component.onFileDropped([file('new.json')]);
    expect(component.isValid()).toBe(false);
    expect(component.importForm.controls.config.value).toBe('');
    component.submit();
    expect(request).not.toHaveBeenCalled();
    ControlledFileReader.instances[1].complete('{"Backup":{"Name":"New"}}');
    expect(component.isValid()).toBe(true);
  });

  it('clears the payload, encryption state and selection when the file is removed', () => {
    const { component, request } = render();
    component.onFileDropped([file('old.aes')]);
    ControlledFileReader.instances[0].complete(new Uint8Array([65, 69, 83, 2, 0, 1]));
    component.onFileDropped([]);
    expect(component.selectedFile()).toEqual([]);
    expect(component.importForm.controls.config.value).toBe('');
    expect(component.isSecureFile()).toBe(false);
    expect(component.isValid()).toBe(false);
    component.submit();
    expect(request).not.toHaveBeenCalled();
  });

  it('aborts the old reader and ignores a queued old completion after the latest file loads', () => {
    const { component, open } = render();
    component.onFileDropped([file('slow.aes')]);
    const old = ControlledFileReader.instances[0];
    const queuedLoad = old.onload!;
    component.onFileDropped([file('latest.json')]);
    ControlledFileReader.instances[1].complete(json);
    old.result = new Uint8Array([65, 69, 83, 2, 0, 1]).buffer;
    queuedLoad(old.event());
    expect(old.abort).toHaveBeenCalledTimes(1);
    expect(component.importForm.controls.config.value).toBe('eyJCYWNrdXAiOnsiTmFtZSI6IuaWh+abuCJ9fQ==');
    expect(component.isSecureFile()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('reports a failed read without retaining the old payload and permits a new selection', () => {
    const { component, open } = render();
    component.onFileDropped([file('old.json')]);
    ControlledFileReader.instances[0].complete(json);
    component.onFileDropped([file('unreadable.json')]);
    ControlledFileReader.instances[1].fail();
    expect(component.isValid()).toBe(false);
    expect(component.importForm.controls.config.value).toBe('');
    expect(open.mock.calls[0][1].data.title).toBe('Failed to read configuration file');
    component.onFileDropped([file('retry.json')]);
    ControlledFileReader.instances[2].complete(json);
    expect(component.isValid()).toBe(true);
  });

  it('handles a synchronous read failure without leaving import enabled', () => {
    const { component, open } = render();
    vi.spyOn(ControlledFileReader.prototype, 'readAsArrayBuffer').mockImplementationOnce(() => {
      throw new Error('Unreadable');
    });
    expect(() => component.onFileDropped([file()])).not.toThrow();
    expect(component.isValid()).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('reports an unexpected current-reader abort', () => {
    const { component, open } = render();
    component.onFileDropped([file()]);
    ControlledFileReader.instances[0].abort();
    expect(component.isValid()).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('aborts reading on destruction and ignores an already queued completion', () => {
    const { fixture, component, open } = render();
    component.onFileDropped([file()]);
    const reader = ControlledFileReader.instances[0];
    const queuedLoad = reader.onload!;
    fixture.destroy();
    reader.result = new TextEncoder().encode(json).buffer;
    queuedLoad(reader.event());
    expect(reader.abort).toHaveBeenCalledTimes(1);
    expect(component.importForm.controls.config.value).toBe('');
    expect(component.isValid()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });
});
