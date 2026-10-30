import { TestBed } from '@angular/core/testing';
import { NavigationError } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { WINDOW } from '../providers/window';
import { ChunkLoadErrorState, isChunkLoadError } from './chunk-load-error';

describe('isChunkLoadError', () => {
  it.each([
    ['Chromium', new TypeError('Failed to fetch dynamically imported module: https://host/chunk-ABC123.js')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://host/chunk-ABC123.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['webpack', Object.assign(new Error('Loading chunk 42 failed.'), { name: 'ChunkLoadError' })],
    ['string', 'Failed to fetch dynamically imported module: https://host/chunk-ABC123.js'],
    ['nested cause', new Error('Navigation failed', { cause: new TypeError('Importing a module script failed.') })],
  ])('recognizes a %s chunk load failure', (_name, error) => {
    expect(isChunkLoadError(error)).toBe(true);
  });

  it.each([
    ['generic error', new Error('Something else went wrong')],
    ['http failure', new TypeError('Failed to fetch')],
    ['null', null],
    ['undefined', undefined],
    ['object', { message: 'Failed to fetch dynamically imported module' }],
  ])('ignores a %s', (_name, error) => {
    expect(isChunkLoadError(error)).toBe(false);
  });

  it('does not follow a self-referencing cause chain forever', () => {
    const error = new Error('loop');
    error.cause = error;
    expect(isChunkLoadError(error)).toBe(false);
  });
});

describe('ChunkLoadErrorState', () => {
  const chunkError = () => new NavigationError(1, '/destinations', new TypeError('Importing a module script failed.'));
  let open: ReturnType<typeof vi.fn>;
  let reload: ReturnType<typeof vi.fn>;
  let state: ChunkLoadErrorState;

  const closeDialog = (confirmed: boolean | undefined) => {
    const options = open.mock.lastCall?.[1] as { closed: (result: unknown) => void };
    options.closed(confirmed);
  };

  beforeEach(() => {
    open = vi.fn();
    reload = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: ShipDialogService, useValue: { open } },
        { provide: WINDOW, useValue: { location: { reload } } },
      ],
    });
    state = TestBed.inject(ChunkLoadErrorState);
  });
  afterEach(() => TestBed.resetTestingModule());

  it('opens the reload dialog for a chunk load failure', () => {
    state.handleNavigationError(chunkError());

    expect(open).toHaveBeenCalledOnce();
    expect(open.mock.lastCall?.[0]).toBe(ConfirmDialogComponent);
    expect(open.mock.lastCall?.[1]).toMatchObject({
      data: { title: 'Application was updated', confirmText: 'Reload', cancelText: 'Not now' },
    });
    expect(reload).not.toHaveBeenCalled();
  });

  it('ignores navigation errors that are not chunk load failures', () => {
    state.handleNavigationError(new NavigationError(1, '/destinations', new Error('guard threw')));

    expect(open).not.toHaveBeenCalled();
  });

  it('reloads the window when the user confirms', () => {
    state.handleNavigationError(chunkError());
    closeDialog(true);

    expect(reload).toHaveBeenCalledOnce();
  });

  it.each([false, undefined])('does not reload when the dialog closes with %s', (result) => {
    state.handleNavigationError(chunkError());
    closeDialog(result);

    expect(reload).not.toHaveBeenCalled();
  });

  it('shows one dialog at a time and allows a new one after it is closed', () => {
    state.handleNavigationError(chunkError());
    state.handleNavigationError(chunkError());
    expect(open).toHaveBeenCalledOnce();

    closeDialog(false);
    state.handleNavigationError(chunkError());
    expect(open).toHaveBeenCalledTimes(2);
  });
});
