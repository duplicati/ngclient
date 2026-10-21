import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { PurgeFilesState, PurgeVersionScope } from '../purge-files.state';
import PurgeVersionScopeComponent from './version-scope.component';

describe('PurgeVersionScopeComponent removal confirmation', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const response = new Subject<unknown>();
    const purge = vi.fn(() => response);
    const open = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [PurgeVersionScopeComponent],
      providers: [
        PurgeFilesState,
        { provide: DuplicatiServer, useValue: { postApiV2BackupPurgeFiles: purge } },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    }).overrideComponent(PurgeVersionScopeComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(PurgeVersionScopeComponent);
    const state = TestBed.inject(PurgeFilesState);
    state.backupId.set('42');
    state.selectedVersion.set('7');
    state.selectedPaths.set('/data/file.txt\0/data/folder/\0C:\\data\\folder\\');
    fixture.detectChanges();
    return { component: fixture.componentInstance, state, response, purge, open, navigate };
  }
  it.each(['paths', 'versions'])('does not prompt or delete without selected %s', (missing) => {
    const { component, state, open, purge } = setup();
    if (missing === 'paths') state.selectedPaths.set('');
    else state.versionScope.set('specific');
    component.purgeFiles();
    expect(open).not.toHaveBeenCalled();
    expect(purge).not.toHaveBeenCalled();
  });
  it('does not delete or navigate when confirmation is cancelled', () => {
    const { component, open, purge, navigate } = setup();
    component.purgeFiles();
    expect(purge).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(purge).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isPurging()).toBe(false);
  });
  it.each([
    ['all', null],
    ['current', [7]],
    ['specific', [2, 9]],
  ] as [PurgeVersionScope, number[] | null][])(
    'sends only the confirmed %s scope and expands folder filters',
    (scope, versions) => {
      const { component, state, open, purge, response, navigate } = setup();
      state.versionScope.set(scope);
      state.specificVersions.set([2, 9]);
      component.purgeFiles();
      expect(purge).not.toHaveBeenCalled();
      open.mock.calls[0][1].closed(true);
      expect(purge).toHaveBeenCalledExactlyOnceWith({
        body: {
          BackupId: '42',
          Filters: ['/data/file.txt', '/data/folder/*', 'C:\\data\\folder\\*'],
          Versions: versions,
        },
      });
      expect(component.isPurging()).toBe(true);
      expect(navigate).not.toHaveBeenCalled();
      response.next({});
      response.complete();
      expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
      expect(component.isPurging()).toBe(false);
    }
  );
  it('shows a deletion error, stops pending state and permits a retry', () => {
    const { component, open, purge, response, navigate } = setup();
    component.purgeFiles();
    open.mock.calls[0][1].closed(true);
    response.error(new Error('permission denied'));
    expect(component.isPurging()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    expect(open.mock.calls[1][1].data.message).toBe('permission denied');
    const retry = new Subject<unknown>();
    purge.mockReturnValue(retry);
    component.purgeFiles();
    open.mock.calls[2][1].closed(true);
    retry.next({});
    retry.complete();
    expect(purge).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
  });
  it('adds and removes individual versions without clearing the other selections', () => {
    const { component, state } = setup();
    state.specificVersions.set([2, 9]);
    component.toggleVersion(7, true);
    component.toggleVersion(2, false);
    expect(state.specificVersions()).toEqual([9, 7]);
    expect(component.isVersionSelected(7)).toBe(true);
    expect(component.isVersionSelected(2)).toBe(false);
  });
});
