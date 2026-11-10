import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import DatabaseComponent from './database.component';

describe('database path validation lifetime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function setup() {
    const responses: Subject<unknown>[] = [];
    const validate = vi.fn(() => {
      const response = new Subject<unknown>();
      responses.push(response);
      return response;
    });
    const backups = signal<Array<{ Backup: { ID: string; DBPath: string } }>>([]);
    TestBed.configureTestingModule({
      imports: [DatabaseComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ id: '42' }) } },
        { provide: BackupsState, useValue: { backups } },
        { provide: DuplicatiServer, useValue: { postApiV1FilesystemValidate: validate } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: ServerSettingsService, useValue: { reducedReporting: signal({ active: false }) } },
      ],
    }).overrideComponent(DatabaseComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(DatabaseComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    async function changePath(path: string) {
      component.backupFilePath.set(path);
      fixture.detectChanges();
      await vi.advanceTimersByTimeAsync(500);
      fixture.detectChanges();
    }
    return { fixture, component, validate, responses, changePath, backups };
  }

  it('does not let a previous path response replace the current successful validation', async () => {
    const { component, validate, responses, changePath } = setup();
    await changePath('/old.sqlite');
    await changePath('/current.sqlite');
    expect(validate).toHaveBeenNthCalledWith(2, { body: { path: '/current.sqlite' } });
    responses[1].next({});
    expect(component.isValidatedPath()).toBe(true);
    responses[0].next({});
    expect(component.lastValidatedPath()).toBe('/current.sqlite');
    expect(component.isValidatedPath()).toBe(true);
  });

  it('keeps the current validation pending when an older request finishes', async () => {
    const { component, responses, changePath } = setup();
    await changePath('/old.sqlite');
    await changePath('/current.sqlite');
    responses[0].complete();
    expect(component.isValidatingPath()).toBe(true);
    expect(component.isWaitingForValidation()).toBe(true);
    responses[1].next({});
    expect(component.isValidatingPath()).toBe(false);
  });

  it('invalidates a previously successful path when revalidation fails', async () => {
    const { fixture, component, responses, changePath, backups } = setup();
    await changePath('/current.sqlite');
    responses[0].next({});
    expect(component.isValidatedPath()).toBe(true);
    backups.set([{ Backup: { ID: '42', DBPath: '/current.sqlite' } }]);
    fixture.detectChanges();
    expect(responses).toHaveLength(2);
    responses[1].error(new Error('not found'));
    await vi.advanceTimersByTimeAsync(0);
    expect(component.isValidatedPath()).toBe(false);
    expect(component.isValidatingPath()).toBe(false);
    await changePath('/retry.sqlite');
    responses[2].next({});
    expect(component.isValidatedPath()).toBe(true);
  });

  it('does not validate an empty path or retain a pending result after clearing it', async () => {
    const { component, validate, responses, changePath } = setup();
    expect(component.isValidatedPath()).toBe(false);
    await changePath('/old.sqlite');
    await changePath('');
    responses[0].next({});
    expect(component.lastValidatedPath()).toBe('');
    expect(component.isValidatedPath()).toBe(false);
    expect(component.isValidatingPath()).toBe(false);
    expect(validate).toHaveBeenCalledTimes(1);
  });

  it('unsubscribes pending validation when the page is destroyed', async () => {
    const { fixture, component, responses, changePath } = setup();
    await changePath('/old.sqlite');
    fixture.destroy();
    responses[0].next({});
    expect(component.lastValidatedPath()).toBe('');
    expect(component.isValidatingPath()).toBe(false);
  });
});
