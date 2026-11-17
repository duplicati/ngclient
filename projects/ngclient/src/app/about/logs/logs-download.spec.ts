import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import LogsLiveComponent from './logs-live/logs-live.component';
import LogsStoredComponent from './logs-stored/logs-stored.component';

// ShipTable fails to initialise under the test bundler; the download button sits outside the table
vi.mock('@ship-ui/core/ship-table', () => ({ ShipTable: [] }));

const storedRows = [
  { BackupID: 1, Timestamp: 1700000100, Message: 'Failed to connect', Exception: 'System.Exception: Boom\n at Run()' },
  { BackupID: -1, Timestamp: 1700000000, Message: 'Server started', Exception: null },
];
// The poll endpoint returns the oldest entry first; the page shows the newest first
const polledRows = [
  { ID: 1, When: '2026-11-14T10:00:00Z', Message: 'Started', Type: 'Information', Tag: 'A', BackupID: '3' },
  { ID: 2, When: '2026-11-14T10:00:01Z', Message: 'Uploaded', Type: 'Information', Tag: 'B', BackupID: '3' },
];

let blobs: Blob[];
let names: string[];
beforeEach(() => {
  blobs = [];
  names = [];
  // jsdom has no object URLs and does not navigate on anchor clicks
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn((blob: Blob) => (blobs.push(blob), 'blob:test')),
  });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    names.push(this.download);
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

async function settle(fixture: ComponentFixture<unknown>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
function downloadButton(fixture: ComponentFixture<unknown>) {
  return fixture.nativeElement.querySelector('button.download-log') as HTMLButtonElement;
}
async function downloaded() {
  expect(blobs).toHaveLength(1);
  expect(blobs[0].type).toBe('application/json');
  return JSON.parse(await blobs[0].text());
}

describe('stored server log download', () => {
  async function render(rows: unknown[]) {
    // Only the first page answers; later requests stay pending so the rows are exactly that page
    let answered = false;
    const get = () => {
      if (answered) return new Promise(() => {});
      answered = true;
      return Promise.resolve(rows);
    };
    TestBed.configureTestingModule({
      imports: [LogsStoredComponent],
      providers: [{ provide: DuplicatiServer, useValue: { getApiV1LogdataLog: get } }],
    });
    const fixture = TestBed.createComponent(LogsStoredComponent);
    await settle(fixture);
    return fixture;
  }
  it('saves the loaded rows as the server returned them', async () => {
    const fixture = await render(storedRows);
    downloadButton(fixture).click();
    expect(await downloaded()).toEqual(storedRows);
    expect(names[0]).toMatch(/^duplicati-stored-log-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\d\.json$/);
  });
  it('is disabled while there is nothing to save', async () => {
    const fixture = await render([]);
    expect(downloadButton(fixture).disabled).toBe(true);
  });
});

describe('live log download', () => {
  async function render(rows: unknown[]) {
    TestBed.configureTestingModule({
      imports: [LogsLiveComponent],
      providers: [{ provide: DuplicatiServer, useValue: { getApiV1LogdataPoll: () => Promise.resolve(rows.slice()) } }],
    });
    const fixture = TestBed.createComponent(LogsLiveComponent);
    fixture.componentRef.setInput('level', 'Information');
    fixture.componentRef.setInput('polling', true);
    await settle(fixture);
    await settle(fixture);
    return fixture;
  }
  it('saves the shown rows in the order they are shown', async () => {
    const fixture = await render(polledRows);
    downloadButton(fixture).click();
    expect(await downloaded()).toEqual([polledRows[1], polledRows[0]]);
    expect(names[0]).toMatch(/^duplicati-live-log-\d{4}-.*\.json$/);
    fixture.destroy();
  });
  it('is disabled while there is nothing to save', async () => {
    const fixture = await render([]);
    expect(downloadButton(fixture).disabled).toBe(true);
    fixture.destroy();
  });
});
