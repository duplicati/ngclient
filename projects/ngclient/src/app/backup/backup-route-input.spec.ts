import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, RouterOutlet, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import BackupComponent from './backup.component';
import { BackupState } from './backup.state';

@Component({ template: '<p>Editor step</p>' })
class StepStub {}

describe('BackupComponent route identity', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  async function setup(path = '/backup/42/general') {
    const backupId = signal<string | null>(null);
    const state = {
      backupId,
      isNew: computed(() => backupId() === 'new'),
      isDraft: signal(false),
      backupName: signal('Backup'),
      saveState: signal({ status: 'idle' }),
      isSubmitting: signal(false),
      finishedLoading: signal(false),
    };
    const load = vi.spyOn(BackupComponent.prototype, 'getBackup').mockImplementation(() => {});
    const defaults = vi.spyOn(BackupComponent.prototype, 'getDefaults').mockImplementation(() => {});
    const children = ['general', 'destination'].map((path) => ({ path, component: StepStub }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            {
              path: 'backup/:id',
              component: BackupComponent,
              children,
              canActivate: [(route) => route.params['id'] !== 'blocked'],
            },
            { path: 'backup-draft/:id', component: BackupComponent, children },
          ],
          withComponentInputBinding()
        ),
        { provide: BackupsState, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
      ],
    });
    TestBed.overrideComponent(BackupComponent, {
      set: {
        imports: [RouterOutlet],
        template: '<router-outlet />',
        providers: [{ provide: BackupState, useValue: state }],
      },
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, BackupComponent);
    return { harness, component, state, load, defaults };
  }

  it('loads the initial existing backup once', async () => {
    const { state, load, defaults } = await setup();
    expect(state.backupId()).toBe('42');
    expect(load).toHaveBeenCalledExactlyOnceWith('42', false);
    expect(defaults).not.toHaveBeenCalled();
  });

  it('loads changed IDs while reusing the existing component', async () => {
    const { harness, component, state, load } = await setup();
    expect(await harness.navigateByUrl('/backup/43/general', BackupComponent)).toBe(component);
    expect(state.backupId()).toBe('43');
    expect(load).toHaveBeenLastCalledWith('43', false);
    expect(await harness.navigateByUrl('/backup/44/destination', BackupComponent)).toBe(component);
    expect(state.backupId()).toBe('44');
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('does not reload for child steps, query parameters or fragments', async () => {
    const { harness, component, state, load } = await setup();
    expect(await harness.navigateByUrl('/backup/42/destination?id=other#details', BackupComponent)).toBe(component);
    await harness.navigateByUrl('/backup/42/general?id=another', BackupComponent);
    expect(state.backupId()).toBe('42');
    expect(load).toHaveBeenCalledExactlyOnceWith('42', false);
  });

  it('uses defaults for new backups and loads existing IDs when reused', async () => {
    const { harness, component, state, load, defaults } = await setup('/backup/new/general');
    expect(defaults).toHaveBeenCalledOnce();
    expect(load).not.toHaveBeenCalled();
    expect(await harness.navigateByUrl('/backup/42/general', BackupComponent)).toBe(component);
    expect(load).toHaveBeenCalledExactlyOnceWith('42', false);
    await harness.navigateByUrl('/backup/new/general', BackupComponent);
    expect(state.backupId()).toBe('new');
    expect(defaults).toHaveBeenCalledTimes(2);
  });

  it('preserves draft identity and passes the draft flag when loading', async () => {
    const { harness, component, state, load } = await setup('/backup-draft/first/general');
    expect(load).toHaveBeenCalledExactlyOnceWith('first', true);
    expect(await harness.navigateByUrl('/backup-draft/second/destination', BackupComponent)).toBe(component);
    expect(state.backupId()).toBe('second');
    expect(load).toHaveBeenLastCalledWith('second', true);
  });

  it('does not change identity when a guard rejects navigation', async () => {
    const { harness, state, load } = await setup();
    await harness.navigateByUrl('/backup/blocked/general');
    expect(TestBed.inject(Router).url).toBe('/backup/42/general');
    expect(state.backupId()).toBe('42');
    expect(load).toHaveBeenCalledOnce();
  });
});
