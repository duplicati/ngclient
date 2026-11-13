import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { DuplicatiServer, GetTaskStateDto } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { RestoreFlowState } from '../restore-flow.state';
import RestoreProgressComponent from './restore-progress.component';

vi.mock('@ship-ui/core/ship-table', async () => {
  const { Component } = await import('@angular/core');
  class ShipTableStub {}
  Component({ selector: 'sh-table', template: '' })(ShipTableStub);
  return { ShipTable: ShipTableStub };
});

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class RestoreShell {}

describe('RestoreProgressComponent route task identity', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(url = '/restore/backup-42/101/progress') {
    const task = new Subject<GetTaskStateDto>();
    const getTask = vi.fn(() => task);
    const wait = vi.fn(() => of({ ID: 101, TaskFinished: '2026-11-12T01:00:00Z', Status: 'Completed' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          ['restore/:id', 'restore-draft/:id', 'restore-from-files'].map((path) => ({
            path,
            component: RestoreShell,
            children: [
              {
                path: ':taskid/progress',
                component: RestoreProgressComponent,
                canActivate: [(route) => route.params['taskid'] !== 'blocked'],
              },
            ],
          })),
          withComponentInputBinding()
        ),
        { provide: DuplicatiServer, useValue: { getApiV1TaskByTaskid: getTask } },
        { provide: ServerStateService, useValue: { waitForTaskToComplete: wait } },
        { provide: StatusBarState, useValue: { statusData: signal(null) } },
        { provide: RestoreFlowState, useValue: { backupId: signal('backup-42') } },
      ],
    });
    TestBed.overrideComponent(RestoreProgressComponent, { set: { template: '', imports: [] } });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    const component = () =>
      harness.fixture.debugElement.query(By.directive(RestoreProgressComponent))
        .componentInstance as RestoreProgressComponent;
    return { harness, component, getTask, task, wait };
  }

  it.each([
    '/restore/backup-42/101/progress',
    '/restore-draft/draft-42/101/progress',
    '/restore-from-files/101/progress',
  ])('requests the numeric task from %s', async (url) => {
    const { getTask } = await setup(url);
    expect(getTask).toHaveBeenCalledExactlyOnceWith({ path: { taskid: 101 } });
  });

  it('prefers the path task over a same-named query parameter', async () => {
    const { getTask } = await setup('/restore/backup-42/00101/progress?taskid=999');
    expect(getTask).toHaveBeenCalledExactlyOnceWith({ path: { taskid: 101 } });
  });

  it('keeps the existing task subscription on query, fragment and reused path changes', async () => {
    const { harness, component, getTask, task } = await setup();
    const original = component();
    await harness.navigateByUrl('/restore/backup-42/101/progress?taskid=999#details');
    await harness.navigateByUrl('/restore/backup-42/102/progress');
    expect(component()).toBe(original);
    expect(getTask).toHaveBeenCalledExactlyOnceWith({ path: { taskid: 101 } });
    task.next({ ID: 101, Status: 'Completed', TaskFinished: '2026-11-12T01:00:00Z' });
    expect(component().restoreResult()).toBe('success');
  });

  it('retains the current task when a guard cancels navigation', async () => {
    const { harness, getTask } = await setup();
    await harness.navigateByUrl('/restore/backup-42/blocked/progress');
    expect(TestBed.inject(Router).url).toBe('/restore/backup-42/101/progress');
    expect(getTask).toHaveBeenCalledOnce();
  });

  it('passes an unfinished task to the existing completion wait', async () => {
    const { component, task, wait } = await setup();
    task.next({ ID: 101, Status: 'Running', TaskStarted: '2026-11-12T00:00:00Z' });
    expect(wait).toHaveBeenCalledExactlyOnceWith(101);
    expect(component().restoreResult()).toBe('success');
  });
});
