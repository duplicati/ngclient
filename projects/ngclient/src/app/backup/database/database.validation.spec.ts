import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import DatabaseComponent from './database.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusStub {}

describe('database path validation lifetime', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  function setup(rendered = false) {
    const responses: Subject<unknown>[] = [];
    const validate = vi.fn(() => {
      const response = new Subject<unknown>();
      responses.push(response);
      return response;
    });
    const backups = signal<Array<{ Backup: { ID: string; DBPath: string } }>>([]);
    const testing = TestBed.configureTestingModule({
      imports: [DatabaseComponent],
      providers: [
        { provide: ActivatedRoute, useValue: { params: of({ id: '42' }) } },
        { provide: BackupsState, useValue: { backups } },
        { provide: DuplicatiServer, useValue: { postApiV1FilesystemValidate: validate } },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: ServerSettingsService, useValue: { reducedReporting: signal({ active: false }) } },
      ],
    });
    if (rendered)
      testing.overrideComponent(DatabaseComponent, {
        remove: { imports: [StatusBarComponent, RouterLink] },
        add: { imports: [StatusStub] },
      });
    else testing.overrideComponent(DatabaseComponent, { set: { template: '', imports: [] } });
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

  it('validates the exact rendered path only after the existing debounce', async () => {
    const { fixture, component, validate, responses } = setup(true);
    const input = fixture.nativeElement.querySelector('input[type=text]') as HTMLInputElement;
    input.value = '/data/path & spaces.sqlite';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.placementForm.path().value()).toBe('/data/path & spaces.sqlite');
    expect(component.backupFilePath()).toBe('/data/path & spaces.sqlite');
    await vi.advanceTimersByTimeAsync(499);
    expect(validate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    expect(validate).toHaveBeenCalledExactlyOnceWith({ body: { path: '/data/path & spaces.sqlite' } });
    responses[0].next({});
    fixture.detectChanges();
    expect(component.isValidatedPath()).toBe(true);
  });

  it('updates the rendered path when resetting to the loaded database location', async () => {
    const { fixture, component, backups } = setup(true);
    backups.set([{ Backup: { ID: '42', DBPath: '/data/original.sqlite' } }]);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input[type=text]') as HTMLInputElement;
    expect(input.value).toBe('/data/original.sqlite');
    input.value = '/data/edited.sqlite';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(component.pathHasChanged()).toBe(true);
    component.resetDatabasePath();
    fixture.detectChanges();
    expect(input.value).toBe('/data/original.sqlite');
    expect(component.pathHasChanged()).toBe(false);
    await vi.advanceTimersByTimeAsync(500);
  });
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
