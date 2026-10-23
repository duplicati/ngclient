import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import VersionLabelsComponent from './version-labels.component';

vi.mock('@ship-ui/core/ship-table', () => ({ ShipTable: [] }));

describe('version label save sequencing', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup() {
    const responses: Subject<unknown>[] = [];
    const save = vi.fn(() => {
      const response = new Subject<unknown>();
      responses.push(response);
      return response;
    });
    const rows = [
      { Version: 3, Time: '2026-10-01T00:00:00Z', Label: 'Old' },
      { Version: 0, Time: '2026-10-20T00:00:00Z', Label: null },
    ];
    const list = vi.fn(() => of({ Data: rows }));
    const navigate = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [VersionLabelsComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV2BackupListFilesets: list, postApiV2BackupSetVersionLabel: save },
        },
        { provide: BackupsState, useValue: { backups: signal([]), getBackupById: () => null } },
        { provide: Router, useValue: { navigate } },
        { provide: ShipDialogService, useValue: { open } },
      ],
    });
    TestBed.overrideComponent(VersionLabelsComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(VersionLabelsComponent);
    fixture.componentRef.setInput('id', '42');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { component: fixture.componentInstance, list, rows, responses, save, navigate, open };
  }
  it('loads newest first and normalizes editable labels without mutating API rows', async () => {
    const { component, list, rows } = await setup();
    expect(list).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42' } });
    expect(component.versions().map((x) => [x.Version, x.EditedLabel])).toEqual([
      [0, ''],
      [3, 'Old'],
    ]);
    expect(rows.map((x) => x.Version)).toEqual([3, 0]);
    expect(rows[1].Label).toBeNull();
  });
  it('does not save or navigate when edits only add whitespace', async () => {
    const { component, save, navigate } = await setup();
    component.updateLabel(3, '  Old  ');
    component.updateLabel(0, '   ');
    component.saveLabels();
    expect(save).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isSaving()).toBe(false);
  });
  it('serializes writes, trims labels and sends null when clearing a label', async () => {
    const { component, responses, save, navigate } = await setup();
    component.updateLabel(0, '  Milestone  ');
    component.updateLabel(3, ' ');
    component.saveLabels();
    expect(component.isSaving()).toBe(true);
    expect(save).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42', Version: 0, Label: 'Milestone' } });
    responses[0].next({});
    expect(save).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    responses[0].complete();
    expect(save).toHaveBeenLastCalledWith({ body: { BackupId: '42', Version: 3, Label: null } });
    expect(navigate).not.toHaveBeenCalled();
    responses[1].next({});
    responses[1].complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(component.isSaving()).toBe(false);
  });
  it('saves only the changed version', async () => {
    const { component, save, responses } = await setup();
    component.updateLabel(3, 'Archive');
    component.saveLabels();
    expect(save).toHaveBeenCalledExactlyOnceWith({ body: { BackupId: '42', Version: 3, Label: 'Archive' } });
    responses[0].complete();
  });
  it('stops the queue on failure, keeps edits and permits retry without navigation', async () => {
    const { component, save, responses, open, navigate } = await setup();
    component.updateLabel(0, 'Latest');
    component.updateLabel(3, 'Archive');
    component.saveLabels();
    responses[0].error(new Error('database busy'));
    expect(save).toHaveBeenCalledTimes(1);
    expect(navigate).not.toHaveBeenCalled();
    expect(component.isSaving()).toBe(false);
    expect(open).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ data: expect.objectContaining({ message: 'database busy' }) })
    );
    expect(component.changedItems()).toHaveLength(2);
    component.saveLabels();
    expect(save).toHaveBeenCalledTimes(2);
    responses[1].complete();
    responses[2].complete();
    expect(component.isSaving()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
