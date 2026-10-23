import { TestBed } from '@angular/core/testing';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStringDto, ConnectionStrings, CreateConnectionStringDto } from '../openapi';
import { ConnectionStringsState } from './connection-strings.state';

describe('ConnectionStringsState saved destinations', () => {
  afterEach(() => TestBed.resetTestingModule());
  const destination: ConnectionStringDto = {
    ID: 42,
    Name: 'Backup storage',
    Description: '',
    BaseUrl: 'ssh://host/folder?auth-password=test%26token',
    CreatedAt: '2026-10-19T00:00:00Z',
    UpdatedAt: '2026-10-19T00:00:00Z',
    Backups: [],
  };
  function setup() {
    const response = new Subject<unknown>();
    const list = vi.fn(() => of({ Data: [destination] }));
    const create = vi.fn(() => response);
    const update = vi.fn(() => response);
    const get = vi.fn(() => of({ Data: destination }));
    const remove = vi.fn(() => of({ Success: true }));
    const updateBackups = vi.fn(() => of({ Success: true }));
    TestBed.configureTestingModule({
      providers: [
        ConnectionStringsState,
        {
          provide: ConnectionStrings,
          useValue: {
            getApiV2ConnectionStrings: list,
            postApiV2ConnectionStrings: create,
            putApiV2ConnectionStringById: update,
            getApiV2ConnectionStringById: get,
            deleteApiV2ConnectionStringById: remove,
            postApiV2ConnectionStringByIdUpdateBackups: updateBackups,
          },
        },
      ],
    });
    return {
      state: TestBed.inject(ConnectionStringsState),
      response,
      list,
      create,
      update,
      get,
      remove,
      updateBackups,
    };
  }
  it('loads saved destinations and reloads after an explicit refresh', () => {
    const { state, list } = setup();
    TestBed.tick();
    expect(state.destinations()).toEqual([destination]);
    expect(list).toHaveBeenCalledTimes(1);
    state.reload();
    TestBed.tick();
    expect(list).toHaveBeenCalledTimes(2);
  });
  it.each(['new', 'existing'])('saves the %s destination without changing its encoded credentials', (mode) => {
    const { state, response, create, update } = setup();
    const data: CreateConnectionStringDto = { Name: destination.Name, BaseUrl: destination.BaseUrl, Description: '' };
    const result = state.save(mode === 'new' ? 'new' : destination, data);
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    const next = vi.fn();
    result.subscribe(next);
    if (mode === 'new') {
      expect(create).toHaveBeenCalledExactlyOnceWith({ body: data });
      expect(update).not.toHaveBeenCalled();
    } else {
      expect(update).toHaveBeenCalledExactlyOnceWith({ path: { id: 42 }, body: data });
      expect(create).not.toHaveBeenCalled();
    }
    expect(data.BaseUrl).toBe(destination.BaseUrl);
    expect(state.isSaving()).toBe(true);
    response.next({ Data: destination });
    expect(next).toHaveBeenCalledWith({ Data: destination });
    response.complete();
    expect(state.isSaving()).toBe(false);
  });
  it.each(['error', 'unsubscribe'])('clears pending save state on %s', (outcome) => {
    const { state, response } = setup();
    const error = vi.fn();
    const subscription = state
      .save('new', { Name: 'storage', BaseUrl: 'file:///backup', Description: '' })
      .subscribe({ error });
    expect(state.isSaving()).toBe(true);
    if (outcome === 'error') {
      const failure = new Error('save failed');
      response.error(failure);
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
    } else subscription.unsubscribe();
    expect(state.isSaving()).toBe(false);
  });
  it('looks up and deletes only the requested destination when subscribed', () => {
    const { state, get, remove } = setup();
    const lookup = state.getById(42);
    const deletion = state.delete(99);
    expect(get).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    lookup.subscribe();
    deletion.subscribe();
    expect(get).toHaveBeenCalledExactlyOnceWith({ path: { id: 42 } });
    expect(remove).toHaveBeenCalledExactlyOnceWith({ path: { id: 99 } });
  });
  it('updates only the selected backups for the chosen saved destination', () => {
    const { state, updateBackups } = setup();
    state.updateBackups(42, ['backup-a', 'backup-c']).subscribe();
    expect(updateBackups).toHaveBeenCalledExactlyOnceWith({
      path: { id: 42 },
      body: { BackupIDs: ['backup-a', 'backup-c'] },
    });
  });
});
