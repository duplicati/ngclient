import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import DeleteVersionsComponent from './delete-versions.component';

// These tests exercise confirmation/API behavior, not table rendering.
// Avoid the table package's JIT import cycle when loading the component.
vi.mock('@ship-ui/core/ship-table', () => ({ ShipTable: [] }));

describe('backup version deletion confirmation', () => {
  let fixture: ComponentFixture<DeleteVersionsComponent>;
  let pending: Subject<unknown>;
  afterEach(() => {
    pending?.complete();
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  async function setup() {
    pending = new Subject<unknown>();
    const remove = vi.fn(() => pending.asObservable());
    const navigate = vi.fn();
    const open = vi.fn((_component: unknown, _options: { closed: (confirmed: boolean) => void }) => {});
    const data = [
      { Version: 9, Time: '2026-09-01T12:00:00Z' },
      { Version: 0, Time: '2026-10-01T12:00:00Z' },
      { Version: 4, Time: '2026-09-15T12:00:00Z' },
    ];
    const list = vi.fn(() => of({ Data: data }));
    TestBed.configureTestingModule({
      imports: [DeleteVersionsComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV2BackupListFilesets: list, postApiV2BackupDeleteVersions: remove },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate } },
        { provide: BackupsState, useValue: { backups: signal([]), getBackupById: () => null } },
      ],
    });
    TestBed.overrideComponent(DeleteVersionsComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(DeleteVersionsComponent);
    fixture.componentRef.setInput('id', 'backup-42');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { component: fixture.componentInstance, remove, open, navigate, list, data };
  }

  it('loads newest first without selecting anything or mutating the server response', async () => {
    const { component, list, data } = await setup();
    expect(list).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: 'backup-42' } });
    expect(component.versions().map((v) => v.Version)).toEqual([0, 4, 9]);
    expect(data.map((v) => v.Version)).toEqual([9, 0, 4]);
    expect(component.noneSelected()).toBe(true);
    expect(component.allSelected()).toBe(false);
  });

  it('does not prompt or delete when no versions are selected', async () => {
    const { component, open, remove } = await setup();
    component.deleteVersions();
    expect(open).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it('cancelling confirmation does not send a deletion request', async () => {
    const { component, open, remove, navigate } = await setup();
    component.toggleSelected(4, null);
    component.deleteVersions();
    expect(open).toHaveBeenCalledWith(
      ConfirmDialogComponent,
      expect.objectContaining({
        data: expect.objectContaining({ confirmText: 'Delete versions', cancelText: 'Cancel' }),
      })
    );
    expect(remove).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(false);
    expect(remove).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isDeleting()).toBe(false);
  });

  it.each([true, false])('deletes selected IDs only after confirmation with compact=%s', async (compact) => {
    const { component, open, remove, navigate } = await setup();
    component.toggleSelected(9, null);
    component.toggleSelected(0, null);
    component.performCompact.set(compact);
    component.deleteVersions();
    expect(remove).not.toHaveBeenCalled();
    open.mock.calls[0][1].closed(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      body: { BackupId: 'backup-42', Versions: [0, 9], SuppressCompact: !compact },
    });
    expect(component.isDeleting()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    pending.next({});
    pending.complete();
    expect(component.isDeleting()).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
  });

  it('tracks individual and bulk selection states', async () => {
    const { component } = await setup();
    component.toggleSelected(4, null);
    expect(component.indeterminate()).toBe(true);
    expect(component.noneSelected()).toBe(false);
    component.toggleSelect();
    expect(component.allSelected()).toBe(true);
    expect(component.indeterminate()).toBe(false);
    component.toggleSelect();
    expect(component.noneSelected()).toBe(true);
    expect(component.allSelected()).toBe(false);
  });
});
