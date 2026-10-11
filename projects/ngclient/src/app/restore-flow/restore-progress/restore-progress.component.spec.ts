import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { finalize, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { DuplicatiServer, GetTaskStateDto, NotificationDto } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { RestoreFlowState } from '../restore-flow.state';
import RestoreProgressComponent from './restore-progress.component';

// Child views are not rendered; avoid ShipTable's initialization cycle in the test bundle.
vi.mock('@ship-ui/core/ship-table', async () => {
  const { Component } = await import('@angular/core');
  class ShipTableStub {}
  Component({ selector: 'sh-table', template: '' })(ShipTableStub);
  return { ShipTable: ShipTableStub };
});

const started = '2026-09-13T04:14:47.000Z';
const finished = '2026-09-13T04:15:47.000Z';

const notification = (backupId: string, timestamp: string): NotificationDto => ({
  ID: 1,
  Type: 'Information',
  Title: 'Restore notification',
  Message: 'Restore details',
  Exception: null,
  BackupID: backupId,
  Action: null,
  Timestamp: timestamp,
  LogEntryID: null,
  MessageID: null,
  MessageLogTag: null,
});

describe('RestoreProgressComponent', () => {
  let fixture: ComponentFixture<RestoreProgressComponent>;
  let task: Subject<GetTaskStateDto>;
  let completion: Subject<GetTaskStateDto>;

  afterEach(() => {
    if (fixture && !fixture.componentRef.hostView.destroyed) fixture.destroy();
    task?.complete();
    completion?.complete();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(metadataStarted?: string) {
    task = new Subject<GetTaskStateDto>();
    completion = new Subject<GetTaskStateDto>();
    const taskFinalized = vi.fn();
    const completionFinalized = vi.fn();
    const getTask = vi.fn(() => task.pipe(finalize(taskFinalized)));
    const wait = vi.fn(() => completion.pipe(finalize(completionFinalized)));
    const backupId = signal('backup-42');
    const statusData = signal({
      backup: { Backup: { Metadata: metadataStarted ? { LastRestoreStarted: metadataStarted } : {} } },
    });
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    TestBed.configureTestingModule({
      imports: [RestoreProgressComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { params: { taskid: '42' } } } },
        { provide: DuplicatiServer, useValue: { getApiV1TaskByTaskid: getTask } },
        { provide: ServerStateService, useValue: { waitForTaskToComplete: wait } },
        { provide: StatusBarState, useValue: { statusData } },
        { provide: RestoreFlowState, useValue: { backupId } },
      ],
    });
    TestBed.overrideComponent(RestoreProgressComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(RestoreProgressComponent);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      getTask,
      wait,
      backupId,
      statusData,
      alert,
      consoleError,
      taskFinalized,
      completionFinalized,
    };
  }

  it('requests the route task and remains pending before its response', () => {
    const { component, getTask, wait } = setup();

    expect(getTask).toHaveBeenCalledExactlyOnceWith({ path: { taskid: 42 } });
    expect(component.restoreResult()).toBe('');
    expect(wait).not.toHaveBeenCalled();
  });

  it.each([
    { status: 'Completed', error: undefined, result: 'success' },
    { status: 'Completed', error: null, result: 'success' },
    { status: 'Completed', error: 'Restore reported errors', result: 'error' },
    { status: 'Completed', error: '', result: 'error' },
    { status: 'Failed', error: 'Restore failed', result: 'error' },
    { status: 'Failed', error: null, result: 'error' },
  ] as const)(
    'classifies an already finished $status task with ErrorMessage=$error as $result',
    ({ status, error, result }) => {
      const { component, wait } = setup();
      task.next({ ID: 42, Status: status, TaskStarted: started, TaskFinished: finished, ErrorMessage: error });
      task.complete();

      expect(component.restoreResult()).toBe(result);
      expect(wait).not.toHaveBeenCalled();
    }
  );

  it.each([
    { status: 'Completed', error: null, result: 'success' },
    { status: 'Completed', error: 'Restore reported errors', result: 'error' },
    { status: 'Failed', error: 'Restore failed', result: 'error' },
  ] as const)('waits for an active task and applies its $status completion as $result', ({ status, error, result }) => {
    const { component, wait } = setup();
    task.next({ ID: 84, Status: 'Running', TaskStarted: started, TaskFinished: null });
    task.complete();

    expect(wait).toHaveBeenCalledExactlyOnceWith(84);
    expect(component.restoreResult()).toBe('');

    completion.next({ ID: 84, Status: status, TaskFinished: finished, ErrorMessage: error });
    completion.complete();

    expect(component.restoreResult()).toBe(result);
  });

  it('shows a task-fetch error without starting a completion wait', () => {
    const { component, wait, alert, consoleError } = setup();
    const error = new Error('Task unavailable');
    task.error(error);

    expect(component.restoreResult()).toBe('error');
    expect(wait).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledExactlyOnceWith('Error fetching task:', error);
    expect(alert).toHaveBeenCalledExactlyOnceWith('Failed to fetch task details. Please try again later.');
  });

  it('releases a pending task request on destroy and ignores its late completed response', () => {
    const { component, taskFinalized, wait } = setup();
    expect(taskFinalized).not.toHaveBeenCalled();

    fixture.destroy();

    expect(taskFinalized).toHaveBeenCalledTimes(1);
    task.next({ ID: 42, Status: 'Completed', TaskFinished: finished });
    expect(component.restoreResult()).toBe('');
    expect(wait).not.toHaveBeenCalled();
  });

  it('does not start a completion wait from a task response received after destroy', () => {
    const { component, wait } = setup();
    fixture.destroy();

    task.next({ ID: 42, Status: 'Running', TaskFinished: null });

    expect(wait).not.toHaveBeenCalled();
    expect(component.restoreResult()).toBe('');
  });

  it('does not show an alert or update state for a task-fetch error after destroy', () => {
    const { component, alert, consoleError } = setup();
    fixture.destroy();

    task.error(new Error('Late task-fetch failure'));

    expect(component.restoreResult()).toBe('');
    expect(alert).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each(['Completed', 'Failed'])('releases the completion wait on destroy and ignores a late $0 result', (status) => {
    const { component, wait, completionFinalized } = setup();
    task.next({ ID: 84, Status: 'Running', TaskFinished: null });
    task.complete();
    expect(wait).toHaveBeenCalledExactlyOnceWith(84);
    expect(completionFinalized).not.toHaveBeenCalled();

    fixture.destroy();

    expect(completionFinalized).toHaveBeenCalledTimes(1);
    completion.next({ ID: 84, Status: status, TaskFinished: finished });
    expect(component.restoreResult()).toBe('');
  });

  it('still releases both subscriptions when a restore completes normally', () => {
    const { component, taskFinalized, completionFinalized } = setup();
    task.next({ ID: 84, Status: 'Running', TaskFinished: null });
    task.complete();
    expect(taskFinalized).toHaveBeenCalledTimes(1);

    completion.next({ ID: 84, Status: 'Completed', TaskFinished: finished });
    completion.complete();

    expect(component.restoreResult()).toBe('success');
    expect(completionFinalized).toHaveBeenCalledTimes(1);
  });

  it('uses the task start time instead of older backup metadata', () => {
    const { component } = setup('19990101T000000Z');
    task.next({ ID: 42, Status: 'Completed', TaskStarted: started, TaskFinished: finished });

    expect(component.lastRestoreStarted()?.toISOString()).toBe(started);
  });

  it('uses compact UTC backup metadata when the task has no start time', () => {
    const { component } = setup('20260913T041447Z');
    task.next({ ID: 42, Status: 'Completed', TaskFinished: finished });

    expect(component.lastRestoreStarted()?.toISOString()).toBe(started);
  });

  it('has no restore start time when neither source provides one', () => {
    const { component } = setup();
    expect(component.lastRestoreStarted()).toBeNull();
  });

  it.each([
    { backup: 'backup-42', timestamp: '2026-09-13T04:14:46.999Z', included: false },
    { backup: 'backup-42', timestamp: started, included: true },
    { backup: 'backup-42', timestamp: finished, included: true },
    { backup: 'other-backup', timestamp: finished, included: false },
  ])('filters notification backup=$backup timestamp=$timestamp', ({ backup, timestamp, included }) => {
    const { component } = setup();
    task.next({ ID: 42, Status: 'Completed', TaskStarted: started, TaskFinished: finished });

    expect(component.notificationFilterPredicate().predicate(notification(backup, timestamp))).toBe(included);
  });

  it('excludes notifications when the restore start time is unavailable', () => {
    const { component } = setup();
    expect(component.notificationFilterPredicate().predicate(notification('backup-42', finished))).toBe(false);
  });

  it('uses the current backup ID when evaluating notifications', () => {
    const { component, backupId } = setup('20260913T041447Z');
    const { predicate } = component.notificationFilterPredicate();
    backupId.set('other-backup');

    expect(predicate(notification('backup-42', finished))).toBe(false);
    expect(predicate(notification('other-backup', finished))).toBe(true);
  });

  it('converts compact server timestamps to UTC dates', () => {
    const { component } = setup();
    expect(component.fixDate('20261231T235959Z').toISOString()).toBe('2026-12-31T23:59:59.000Z');
  });
});
