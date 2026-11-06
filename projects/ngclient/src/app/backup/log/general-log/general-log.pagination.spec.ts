import { DecimalPipe } from '@angular/common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { DayJsProvider } from '../../../core/providers/dayjs';
import { BackupsState } from '../../../core/states/backups.state';
import { GeneralLogComponent } from './general-log.component';

type Request = { path: { id: string }; query?: { offset?: number; pagesize?: number } };
const rows = Array.from({ length: 102 }, (_, index) => ({
  ID: 2000 - index * 7,
  OperationID: 7,
  Timestamp: 1700000000 + index,
  Type: 'Event',
  Message: `Log ${2000 - index * 7}`,
  Exception: {},
}));
afterEach(() => TestBed.resetTestingModule());
async function setup() {
  const load = vi.fn((request: Request): Promise<typeof rows> | Subject<typeof rows> =>
    Promise.resolve(
      rows
        .filter((row) => request.query?.offset === undefined || row.ID < request.query.offset)
        .slice(0, request.query?.pagesize ?? 100)
    )
  );
  TestBed.configureTestingModule({
    imports: [GeneralLogComponent],
    providers: [
      DecimalPipe,
      DayJsProvider,
      {
        provide: DuplicatiServer,
        useValue: { getApiV1BackupById: () => Promise.resolve({}), getApiV1BackupByIdLog: load },
      },
      { provide: BackupsState, useValue: {} },
    ],
  });
  const fixture = TestBed.createComponent(GeneralLogComponent);
  fixture.componentRef.setInput('backupId', '42');
  await settle(fixture);
  return { fixture, component: fixture.componentInstance, load };
}
async function settle(fixture: ComponentFixture<GeneralLogComponent>) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}
function button(fixture: ComponentFixture<GeneralLogComponent>, label: string) {
  const found = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
  const result = found.find((button) => button.textContent?.trim() === label);
  expect(result, `Missing button: ${label}`).toBeDefined();
  return result!;
}
describe('job execution log cursor pagination', () => {
  it('passes cursor and page size to the existing log endpoint', async () => {
    const { fixture, component, load } = await setup();
    component.pagination.update((page) => ({ ...page, offset: 1307, pagesize: 25 }));
    await settle(fixture);
    expect(load).toHaveBeenLastCalledWith({ path: { id: '42' }, query: { offset: 1307, pagesize: 25 } });
  });
  it('uses the oldest displayed ID, preserves gaps and allows returning to the latest logs', async () => {
    const { fixture, component, load } = await setup();
    expect(component.resource.value()).toHaveLength(100);
    expect(button(fixture, 'Newer entries').disabled).toBe(true);
    button(fixture, 'Older entries').click();
    await settle(fixture);
    expect(load.mock.lastCall?.[0].query?.offset).toBe(1307);
    expect(component.resource.value()?.map((row) => row.id)).toEqual([1300, 1293]);
    expect(button(fixture, 'Older entries').disabled).toBe(true);
    button(fixture, 'Newer entries').click();
    await settle(fixture);
    expect(load.mock.lastCall?.[0].query?.offset).toBeUndefined();
    expect(component.resource.value()).toHaveLength(100);
    expect(button(fixture, 'Newer entries').disabled).toBe(true);
  });
  it('prevents duplicate navigation while the next page is pending', async () => {
    const { fixture, load } = await setup();
    const response = new Subject<typeof rows>();
    load.mockReturnValueOnce(response);
    button(fixture, 'Older entries').click();
    fixture.detectChanges();
    TestBed.tick();
    expect(button(fixture, 'Older entries').disabled).toBe(true);
    expect(button(fixture, 'Newer entries').disabled).toBe(true);
    button(fixture, 'Older entries').click();
    button(fixture, 'Newer entries').click();
    expect(load).toHaveBeenCalledTimes(2);
    response.next(rows.slice(100));
    response.complete();
    await settle(fixture);
    expect(button(fixture, 'Newer entries').disabled).toBe(false);
  });
  it('keeps the failed cursor for retry and still allows returning to newer entries', async () => {
    const { fixture, component, load } = await setup();
    const response = new Subject<typeof rows>();
    load.mockReturnValueOnce(response);
    button(fixture, 'Older entries').click();
    fixture.detectChanges();
    TestBed.tick();
    response.error(new Error('Database temporarily locked'));
    await settle(fixture);
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Could not load log entries.');
    expect(button(fixture, 'Newer entries').disabled).toBe(false);
    button(fixture, 'Retry').click();
    await settle(fixture);
    expect(load.mock.lastCall?.[0].query?.offset).toBe(1307);
    expect(component.resource.value()).toHaveLength(2);
  });
  it('resets the cursor when the backup ID changes', async () => {
    const { fixture, load } = await setup();
    button(fixture, 'Older entries').click();
    await settle(fixture);
    fixture.componentRef.setInput('backupId', '84');
    await settle(fixture);
    expect(load.mock.lastCall?.[0]).toEqual({ path: { id: '84' }, query: { offset: undefined, pagesize: 100 } });
    expect(button(fixture, 'Newer entries').disabled).toBe(true);
  });
  it('clears expanded details and copied state on page changes', async () => {
    const { fixture, component } = await setup();
    component.openEntry.set(2000);
    component.openSection.set('errors');
    component.expandedLogLines.set(new Set(['old-entry']));
    component.copied.set('raw');
    fixture.detectChanges();
    button(fixture, 'Older entries').click();
    await settle(fixture);
    expect(component.openEntry()).toBeNull();
    expect(component.openSection()).toBeNull();
    expect(component.expandedLogLines().size).toBe(0);
    expect(component.copied()).toBeNull();
  });
  it('does not loop when a server returns the same cursor page again', async () => {
    const { fixture, load } = await setup();
    load.mockResolvedValueOnce(rows.slice(0, 100));
    button(fixture, 'Older entries').click();
    await settle(fixture);
    expect(button(fixture, 'Older entries').disabled).toBe(true);
    button(fixture, 'Older entries').click();
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('can return from an empty page after a full batch', async () => {
    const { fixture, load } = await setup();
    load.mockResolvedValueOnce([]);
    button(fixture, 'Older entries').click();
    await settle(fixture);
    expect(fixture.nativeElement.textContent).toContain('No log entries on this page.');
    expect(button(fixture, 'Older entries').disabled).toBe(true);
    expect(button(fixture, 'Newer entries').disabled).toBe(false);
  });
  it('walks back through multiple cursor pages in reverse order', async () => {
    const { fixture, load } = await setup();
    const second = Array.from({ length: 100 }, (_, index) => ({ ...rows[0], ID: 1300 - index * 7 }));
    const third = [
      { ...rows[0], ID: 600 },
      { ...rows[0], ID: 593 },
    ];
    load.mockResolvedValueOnce(second).mockResolvedValueOnce(third).mockResolvedValueOnce(second);
    button(fixture, 'Older entries').click();
    await settle(fixture);
    button(fixture, 'Older entries').click();
    await settle(fixture);
    button(fixture, 'Newer entries').click();
    await settle(fixture);
    button(fixture, 'Newer entries').click();
    await settle(fixture);
    expect(load.mock.calls.map(([request]) => request.query?.offset)).toEqual([undefined, 1307, 607, 1307, undefined]);
    expect(button(fixture, 'Newer entries').disabled).toBe(true);
  });
});
