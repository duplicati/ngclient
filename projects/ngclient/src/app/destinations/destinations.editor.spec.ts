import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectionStringDto } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import Destinations from './destinations';

describe('saved destination editor actions', () => {
  afterEach(() => TestBed.resetTestingModule());
  const destination: ConnectionStringDto = {
    ID: 3,
    Name: 'Documents',
    Description: 'Current description',
    BaseUrl: 'file:///archive',
    CreatedAt: '2026-10-01T00:00:00Z',
    UpdatedAt: '2026-10-01T00:00:00Z',
    Backups: [],
  };
  function setup() {
    const lookup = new Subject<{ Data: ConnectionStringDto }>();
    const saved = new Subject<unknown>();
    const deleted = new Subject<unknown>();
    const updated = new Subject<unknown>();
    const getById = vi.fn(() => lookup);
    const save = vi.fn((_selection: unknown, _body: unknown) => saved);
    const remove = vi.fn(() => deleted);
    const updateBackups = vi.fn(() => updated);
    const reload = vi.fn();
    const getBackups = vi.fn();
    const open = vi.fn((_component: unknown, _options: { closed: (confirmed: boolean) => void }) => {});
    const destinations = signal<ConnectionStringDto[]>([]);
    const backups = signal([
      { Backup: { ID: 'same', TargetURL: 'file:///archive' } },
      { Backup: { ID: 'stale', TargetURL: 'file:///old' } },
    ]);
    TestBed.configureTestingModule({
      imports: [Destinations],
      providers: [
        {
          provide: ConnectionStringsState,
          useValue: {
            isSaving: signal(false),
            destinations,
            resourceDestinations: { isLoading: signal(false) },
            getById,
            save,
            delete: remove,
            updateBackups,
            reload,
          },
        },
        { provide: BackupsState, useValue: { backups, getBackups } },
        { provide: ShipDialogService, useValue: { open } },
      ],
    });
    TestBed.overrideComponent(Destinations, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(Destinations);
    fixture.detectChanges();
    getBackups.mockClear();
    return {
      component: fixture.componentInstance,
      lookup,
      saved,
      deleted,
      updated,
      getById,
      save,
      remove,
      updateBackups,
      reload,
      getBackups,
      open,
      destinations,
    };
  }
  it('shows cached fields, then fills the editor from the requested destination without saving', () => {
    const { component, getById, lookup, save } = setup();
    component.selectDestination(destination);
    expect(component.editName()).toBe('Documents');
    expect(getById).toHaveBeenCalledExactlyOnceWith(3);
    lookup.next({
      Data: { ...destination, Name: 'Fresh name', Description: 'Fresh description', BaseUrl: 'file:///fresh' },
    });
    lookup.complete();
    expect(component.editName()).toBe('Fresh name');
    expect(component.editDescription()).toBe('Fresh description');
    expect(component.editBaseUrl()).toBe('file:///fresh');
    expect(component.isUrlChanged()).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });
  it('cancels editing without persisting or reloading destinations', () => {
    const { component, save, reload } = setup();
    component.selectDestination(destination);
    component.editName.set('Discard');
    component.cancelEdit();
    expect(component.selectedDestination()).toBeNull();
    expect(save).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
  it('saves edited fields and refreshes lists only after acknowledgement', () => {
    const { component, save, saved, reload, getBackups } = setup();
    component.selectDestination(destination);
    component.editName.set('Renamed');
    component.editDescription.set('New description');
    component.editBaseUrl.set('file:///new');
    component.save();
    expect(save).toHaveBeenCalledExactlyOnceWith(destination, {
      Name: 'Renamed',
      Description: 'New description',
      BaseUrl: 'file:///new',
    });
    expect(component.selectedDestination()).toBe(destination);
    expect(reload).not.toHaveBeenCalled();
    expect(getBackups).not.toHaveBeenCalled();
    saved.next({});
    saved.complete();
    expect(component.selectedDestination()).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(getBackups).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('creates a numbered provider name for a new destination and does not inherit the previous description', () => {
    const { component, destinations, save, saved } = setup();
    destinations.set([
      { ...destination, Name: 'unknown-provider #1' },
      { ...destination, ID: 4, Name: 'unknown-provider #2' },
    ]);
    component.selectDestination('new');
    component.editBaseUrl.set('unknown-provider://new');
    component.editDescription.set('not retained');
    component.save();
    expect(save).toHaveBeenCalledExactlyOnceWith('new', {
      Name: 'unknown-provider #3',
      Description: null,
      BaseUrl: 'unknown-provider://new',
    });
    saved.complete();
  });
  it('does nothing if no destination is being edited', () => {
    const { component, save } = setup();
    component.save();
    expect(save).not.toHaveBeenCalled();
  });
  it('requires delete confirmation and waits for deletion before reloading', () => {
    const { component, open, remove, deleted, reload } = setup();
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    component.deleteDestination(3, event);
    open.mock.calls[0][1].closed(false);
    expect(remove).not.toHaveBeenCalled();
    component.deleteDestination(3, event);
    open.mock.calls[1][1].closed(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith(3);
    expect(reload).not.toHaveBeenCalled();
    deleted.next({});
    deleted.complete();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalledTimes(2);
  });
  it('updates only existing out-of-sync backups after confirmation and refreshes after acknowledgement', () => {
    const { component, open, updateBackups, updated, reload, getBackups } = setup();
    const linked: ConnectionStringDto = {
      ...destination,
      Backups: [
        { ID: 'same', Name: 'Current' },
        { ID: 'stale', Name: 'Outdated' },
        { ID: 'missing', Name: 'Missing' },
      ],
    };
    const event = { stopPropagation: vi.fn() } as unknown as Event;
    component.updateBackupsSync(linked, event);
    open.mock.calls[0][1].closed(false);
    expect(updateBackups).not.toHaveBeenCalled();
    component.updateBackupsSync(linked, event);
    open.mock.calls[1][1].closed(true);
    expect(updateBackups).toHaveBeenCalledExactlyOnceWith(3, ['stale']);
    expect(reload).not.toHaveBeenCalled();
    updated.next({});
    updated.complete();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(getBackups).toHaveBeenCalledExactlyOnceWith(true);
  });
});
