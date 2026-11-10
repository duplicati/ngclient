import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ListBrokenFilesFilesetItem } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import BrokenFilesComponent from './broken-files.component';

describe('BrokenFilesComponent purge confirmation', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(data: ListBrokenFilesFilesetItem[] = []) {
    const response = new Subject<unknown>();
    const list = vi.fn(() => of({ Data: data }));
    const purge = vi.fn(() => response);
    const open = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [BrokenFilesComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV2BackupListBrokenFiles: list, postApiV2BackupPurgeBrokenFiles: purge },
        },
        { provide: BackupsState, useValue: { getBackupById: vi.fn(() => null) } },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate } },
      ],
    }).overrideComponent(BrokenFilesComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(BrokenFilesComponent);
    fixture.componentRef.setInput('id', '42');
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, list, purge, open, navigate, response };
  }
  const fileset = (FilesetTime: string, count: number): ListBrokenFilesFilesetItem => ({
    FilesetID: 1,
    FilesetTime,
    Files: Array.from({ length: count }, (_, i) => ({ Path: '/data/file' + i, Size: 10 })),
  });
  it('loads the requested backup and sorts filesets without changing the API array', () => {
    const data = [fileset('2026-10-09', 1), fileset('2026-10-11', 2)];
    const { component, list } = setup(data);
    expect(list).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42' } });
    expect(component.filesets().map((x) => x.FilesetTime)).toEqual(['2026-10-11', '2026-10-09']);
    expect(data.map((x) => x.FilesetTime)).toEqual(['2026-10-09', '2026-10-11']);
    expect(component.totalFiles()).toBe(3);
    expect(component.hasBrokenFiles()).toBe(true);
    expect(component.isLoading()).toBe(false);
  });
  it('does not offer purge when the returned filesets contain no broken files', () => {
    const { component, open, purge } = setup([fileset('2026-10-11', 0)]);
    component.purgeBrokenFiles();
    expect(component.hasBrokenFiles()).toBe(false);
    expect(open).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
  it('keeps the data and performs no request when the user cancels', () => {
    const { component, open, purge, navigate } = setup([fileset('2026-10-11', 2)]);
    component.purgeBrokenFiles();
    expect(open.mock.calls[0][1].data.message).toContain('2');
    expect(purge).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(purge).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.totalFiles()).toBe(2);
    expect(component.isPurging()).toBe(false);
  });
  it('purges only after confirmation and waits for the request before navigation', () => {
    const { component, open, purge, navigate, response } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    expect(purge).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(true);
    expect(purge).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42' } });
    expect(component.isPurging()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    response.next({});
    response.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(component.isPurging()).toBe(false);
  });
  it('does not purge another job through an earlier confirmation', () => {
    const { fixture, component, open, purge } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    fixture.componentRef.setInput('id', '43');
    fixture.detectChanges();
    TestBed.tick();
    open.mock.calls[0][1].closed(true);
    expect(purge).not.toHaveBeenCalled();
  });

  it('does not submit a confirmation after leaving the page', () => {
    const { fixture, component, open, purge } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    fixture.destroy();
    open.mock.calls[0][1].closed(true);
    expect(purge).not.toHaveBeenCalled();
  });

  it('does not open overlapping confirmations or submit twice while purging', () => {
    const { component, open, purge } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    component.purgeBrokenFiles();
    expect(open).toHaveBeenCalledTimes(1);
    const closed = open.mock.calls[0][1].closed;
    closed(true);
    closed(true);
    component.purgeBrokenFiles();
    expect(purge).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('stops observing the purge when the page is destroyed', () => {
    const { fixture, component, open, response, navigate } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    open.mock.calls[0][1].closed(true);
    expect(response.observed).toBe(true);
    fixture.destroy();
    expect(response.observed).toBe(false);
    response.next({});
    response.complete();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('cancels observation when switching jobs and ignores the old response', () => {
    const { fixture, component, open, response, navigate } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    open.mock.calls[0][1].closed(true);
    fixture.componentRef.setInput('id', '43');
    fixture.detectChanges();
    TestBed.tick();
    expect(response.observed).toBe(false);
    expect(component.isPurging()).toBe(false);
    response.next({});
    response.complete();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('releases pending state after a failure and retries with a new confirmation', () => {
    const { component, open, purge, response, navigate } = setup([fileset('2026-10-11', 1)]);
    component.purgeBrokenFiles();
    open.mock.calls[0][1].closed(true);
    response.error(new Error('Offline'));
    expect(component.isPurging()).toBe(false);
    expect(component.purgeError()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    const retry = new Subject<unknown>();
    purge.mockReturnValue(retry);
    component.purgeBrokenFiles();
    open.mock.calls[1][1].closed(true);
    expect(component.purgeError()).toBe(false);
    expect(purge).toHaveBeenCalledTimes(2);
    retry.next({});
    retry.complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
  });
});
