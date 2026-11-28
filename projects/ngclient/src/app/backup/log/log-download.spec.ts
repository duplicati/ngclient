import { DecimalPipe } from '@angular/common';
import { Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { GeneralLogComponent } from './general-log/general-log.component';
import { RemoteLogComponent } from './remote-log/remote-log.component';

const jobRows = [
  {
    ID: 9,
    OperationID: 3,
    Timestamp: 1700000100,
    Type: 'Result',
    Message: '{"MainOperation":"Backup","ParsedResult":"Success"}',
    Exception: {},
  },
  { ID: 8, OperationID: 2, Timestamp: 1700000000, Type: 'Event', Message: 'Unstructured', Exception: 'Boom' },
];
const remoteRows = [
  { ID: 5, OperationID: 3, Timestamp: 1700000100, Operation: 'put', Path: 'a.zip.aes', Data: '{"Size":10}' },
  { ID: 4, OperationID: 3, Timestamp: 1700000000, Operation: 'delete', Path: 'b.zip.aes', Data: 'IOException' },
];

let blobs: Blob[];
let downloads: { href: string; download: string }[];
beforeEach(() => {
  blobs = [];
  downloads = [];
  // jsdom has no object URLs and does not navigate on anchor clicks
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => (blobs.push(blob), `blob:test/${blobs.length}`)),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push({ href: this.href, download: this.download });
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

async function render<T>(component: Type<T>, server: object) {
  TestBed.configureTestingModule({
    imports: [component],
    providers: [DecimalPipe, { provide: DuplicatiServer, useValue: server }, { provide: BackupsState, useValue: {} }],
  });
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('backupId', '42');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}
function downloadButton(fixture: ComponentFixture<unknown>) {
  return fixture.nativeElement.querySelector('button.download-log') as HTMLButtonElement;
}
async function downloaded() {
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe('application/json');
  return JSON.parse(await blobs[0].text());
}

describe('job log download', () => {
  it('saves the rows of the shown page as the server returned them', async () => {
    const fixture = await render(GeneralLogComponent, {
      getApiV1BackupById: () => Promise.resolve({}),
      getApiV1BackupByIdLog: () => Promise.resolve(jobRows),
    });
    downloadButton(fixture).click();
    expect(await downloaded()).toEqual(jobRows);
    expect(downloads).toHaveLength(1);
    expect(downloads[0].href).toBe('blob:test/1');
    expect(downloads[0].download).toMatch(/^duplicati-job-log-backup-42-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.json$/);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test/1');
  });
  it('is disabled while there is nothing to save', async () => {
    const fixture = await render(GeneralLogComponent, {
      getApiV1BackupById: () => Promise.resolve({}),
      getApiV1BackupByIdLog: () => Promise.resolve([]),
    });
    expect(downloadButton(fixture).disabled).toBe(true);
  });
});

describe('remote log download', () => {
  it('saves the loaded rows with their data string untouched', async () => {
    const fixture = await render(RemoteLogComponent, {
      getApiV1BackupByIdRemotelog: () => Promise.resolve(remoteRows),
    });
    downloadButton(fixture).click();
    expect(await downloaded()).toEqual(remoteRows);
    expect(downloads[0].download).toMatch(/^duplicati-remote-log-backup-42-.*\.json$/);
  });
  it('renders the button as a ship button', async () => {
    const fixture = await render(RemoteLogComponent, {
      getApiV1BackupByIdRemotelog: () => Promise.resolve(remoteRows),
    });
    expect(downloadButton(fixture).classList).toContain('sh-sheet-h');
  });
  it('is disabled while there is nothing to save', async () => {
    const fixture = await render(RemoteLogComponent, {
      getApiV1BackupByIdRemotelog: () => Promise.resolve([]),
    });
    expect(downloadButton(fixture).disabled).toBe(true);
  });
});
