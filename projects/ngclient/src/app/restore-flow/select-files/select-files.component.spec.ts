import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ConfirmDialogComponent,
  ConfirmDialogData,
} from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, GetTaskStateDto } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import SelectFilesComponent, { createRestoreSelectFilesForm } from './select-files.component';

const time = '2026-09-13T04:00:00Z';
const otherTime = '2026-09-12T04:00:00Z';
const versionId = `temp-42+${time}`;

describe('SelectFilesComponent restore database repair', () => {
  let fixture: ComponentFixture<SelectFilesComponent>;
  const pending: { complete(): void }[] = [];

  afterEach(() => {
    fixture?.destroy();
    pending.splice(0).forEach((request) => request.complete());
    TestBed.resetTestingModule();
  });

  function setup(isTemporary = true) {
    const form = createRestoreSelectFilesForm();
    const flow = {
      selectFilesForm: form,
      selectFilesFormSignal: signal(form.getRawValue()),
      selectOption: signal('0'),
      backupId: signal('temp-42'),
      versionOptionsLoading: signal(true),
      versionOptions: signal([
        { Version: 0, Time: time },
        { Version: 1, Time: otherTime },
      ]),
      isFileRestore: signal(true),
      extendedDataType: signal<string | null>(null),
      backup: signal({ Backup: { IsTemporary: isTemporary } }),
    };
    const repairs: Subject<{ ID: number }>[] = [];
    const tasks: Subject<GetTaskStateDto>[] = [];
    const repair = vi.fn(() => {
      const request = new Subject<{ ID: number }>();
      repairs.push(request);
      pending.push(request);
      return request.asObservable();
    });
    const wait = vi.fn(() => {
      const request = new Subject<GetTaskStateDto>();
      tasks.push(request);
      pending.push(request);
      return request.asObservable();
    });
    const listFolder = vi.fn(() => {
      const request = new Subject<{ Data: [] }>();
      pending.push(request);
      return request.asObservable();
    });
    const open = vi.fn(
      (_component: unknown, _options: { data: ConfirmDialogData; closed: (retry: boolean) => void }) => {}
    );
    TestBed.configureTestingModule({
      imports: [SelectFilesComponent],
      providers: [
        { provide: RestoreFlowState, useValue: flow },
        { provide: ServerStateService, useValue: { waitForTaskToComplete: wait } },
        {
          provide: DuplicatiServer,
          useValue: { postApiV1BackupByIdRepairupdate: repair, postApiV2BackupListFolder: listFolder },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: SysinfoState, useValue: { hasV2ListOperations: () => true } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
      ],
    });
    TestBed.overrideComponent(SelectFilesComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(SelectFilesComponent);
    fixture.detectChanges();
    const startTask = (index = 0) => {
      repairs[index].next({ ID: 100 + index });
      repairs[index].complete();
      fixture.detectChanges();
    };
    const finishTask = (task: GetTaskStateDto, index = 0) => {
      tasks[index].next({ ID: 100 + index, TaskFinished: '2026-09-13T04:14:47.898Z', ...task });
      tasks[index].complete();
      fixture.detectChanges();
    };
    return { component: fixture.componentInstance, flow, repair, wait, listFolder, open, startTask, finishTask };
  }

  it('starts repair and does not list folders while the task is pending', () => {
    const { component, repair, wait, listFolder, startTask } = setup();
    expect(repair).toHaveBeenCalledExactlyOnceWith({ path: { id: 'temp-42' }, body: { only_paths: true, time } });
    startTask();
    expect(wait).toHaveBeenCalledExactlyOnceWith(100);
    expect(component.isRepairing()).toBe(true);
    expect(component.loadedVersions()[versionId]).toBeUndefined();
    expect(listFolder).not.toHaveBeenCalled();
  });

  it('lists folders without repair for a non-temporary backup', () => {
    const { repair, listFolder } = setup(false);
    expect(repair).not.toHaveBeenCalled();
    expect(listFolder).toHaveBeenCalledExactlyOnceWith({
      body: {
        BackupId: 'temp-42',
        Time: time,
        Paths: null,
        PageSize: 0,
        Page: 0,
        ReturnExtended: true,
      },
    });
  });

  it.each([
    { status: 'Failed', error: 'Wrong passphrase', exception: 'Less useful exception', expected: 'Wrong passphrase' },
    { status: 'Failed', error: null, exception: 'Repair exception details', expected: 'Repair exception details' },
    { status: 'Failed', error: '', exception: '', expected: 'The restore database repair failed.' },
    { status: 'Completed', error: 'Repair reported errors', exception: null, expected: 'Repair reported errors' },
    { status: 'Completed', error: '', exception: '', expected: 'The restore database repair failed.' },
  ] as const)(
    'shows the $status repair failure without loading folders: $expected',
    ({ status, error, exception, expected }) => {
      const { component, repair, listFolder, open, startTask, finishTask } = setup();
      startTask();
      finishTask({ Status: status, ErrorMessage: error, Exception: exception });

      expect(component.loadedVersions()[versionId]).toBeUndefined();
      expect(component.isRepairing()).toBe(false);
      expect(listFolder).not.toHaveBeenCalled();
      expect(open).toHaveBeenCalledExactlyOnceWith(
        ConfirmDialogComponent,
        expect.objectContaining({
          data: {
            title: 'Restore database repair failed',
            message: expected,
            confirmText: 'Retry',
            cancelText: 'Cancel',
          },
        })
      );
      fixture.detectChanges();
      expect(repair).toHaveBeenCalledTimes(1);
      open.mock.calls[0][1].closed(false);
      fixture.detectChanges();
      expect(repair).toHaveBeenCalledTimes(1);
      expect(listFolder).not.toHaveBeenCalled();
    }
  );

  it.each(['Failed', 'Completed'] as const)(
    'retries a %s repair with errors only after approval and lists folders after the retry succeeds',
    (status) => {
      const { component, repair, listFolder, open, startTask, finishTask } = setup();
      startTask();
      finishTask({ Status: status, ErrorMessage: 'Network interrupted' });
      expect(open).toHaveBeenCalledTimes(1);
      expect(repair).toHaveBeenCalledTimes(1);
      expect(listFolder).not.toHaveBeenCalled();
      open.mock.calls[0][1].closed(true);
      fixture.detectChanges();
      expect(repair).toHaveBeenCalledTimes(2);
      expect(repair.mock.calls[1]).toEqual(repair.mock.calls[0]);
      expect(component.isRepairing()).toBe(true);
      startTask(1);
      const before = component.loadedVersions();
      finishTask({ Status: 'Completed' }, 1);
      expect(component.loadedVersions()).not.toBe(before);
      expect(component.loadedVersions()[versionId]).toBe(true);
      expect(component.isRepairing()).toBe(false);
      expect(listFolder).toHaveBeenCalledTimes(1);
      fixture.detectChanges();
      expect(repair).toHaveBeenCalledTimes(2);
      expect(open).toHaveBeenCalledTimes(1);
    }
  );

  it.each([undefined, null])(
    'loads a successfully repaired version with ErrorMessage=%s without repairing it again',
    (error) => {
      const { component, flow, repair, listFolder, open, startTask, finishTask } = setup();
      startTask();
      finishTask({ Status: 'Completed', ErrorMessage: error });
      expect(component.loadedVersions()[versionId]).toBe(true);
      expect(listFolder).toHaveBeenCalledTimes(1);
      expect(open).not.toHaveBeenCalled();
      flow.versionOptions.set([...flow.versionOptions()]);
      fixture.detectChanges();
      expect(repair).toHaveBeenCalledTimes(1);
    }
  );

  it.each(['version', 'backup'] as const)('ignores an old retry dialog after the selected %s changes', (change) => {
    const { flow, repair, open, listFolder, startTask, finishTask } = setup();
    startTask();
    finishTask({ Status: 'Failed', ErrorMessage: 'Wrong passphrase' });
    expect(open).toHaveBeenCalledTimes(1);
    if (change === 'version') flow.selectOption.set('1');
    else flow.backupId.set('temp-43');
    fixture.detectChanges();
    expect(repair).toHaveBeenCalledTimes(2);
    open.mock.calls[0][1].closed(true);
    fixture.detectChanges();
    expect(repair).toHaveBeenCalledTimes(2);
    expect(listFolder).not.toHaveBeenCalled();
  });
});
