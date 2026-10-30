import { inject, Injectable } from '@angular/core';
import { NavigationError, withNavigationErrorHandler } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { WINDOW } from '../providers/window';

/**
 * Messages the browsers use when a dynamic `import()` of a lazy route chunk fails.
 * The production build uses hashed chunk file names, so after a deploy the chunks an
 * already-open client still refers to no longer exist and these are the errors it sees.
 */
const CHUNK_LOAD_ERROR_MESSAGES: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i, // Chromium
  /error loading dynamically imported module/i, // Firefox
  /Importing a module script failed/i, // Safari
];
const CHUNK_LOAD_ERROR_NAME = 'ChunkLoadError';
const MAX_CAUSE_DEPTH = 5;

function matchesChunkLoadError(error: unknown): boolean {
  if (typeof error === 'string') return CHUNK_LOAD_ERROR_MESSAGES.some((pattern) => pattern.test(error));
  if (!(error instanceof Error)) return false;
  return (
    error.name === CHUNK_LOAD_ERROR_NAME || CHUNK_LOAD_ERROR_MESSAGES.some((pattern) => pattern.test(error.message))
  );
}

/** True when the error means a lazy route chunk could not be fetched, following the `cause` chain. */
export function isChunkLoadError(error: unknown): boolean {
  let current = error;

  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth++) {
    if (matchesChunkLoadError(current)) return true;
    current = current instanceof Error ? current.cause : undefined;
  }

  return false;
}

@Injectable({
  providedIn: 'root',
})
export class ChunkLoadErrorState {
  #dialog = inject(ShipDialogService);
  #window = inject(WINDOW);
  #dialogOpen = false;

  /**
   * Offers a reload when a navigation failed because its chunk could not be fetched.
   * Only one dialog is shown at a time; while it is open further failures are ignored.
   */
  handleNavigationError(event: NavigationError): void {
    if (this.#dialogOpen || !isChunkLoadError(event.error)) return;

    this.#dialogOpen = true;
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Application was updated`,
        message: $localize`The page could not be loaded because a new version of the application is available. Reload to continue?`,
        confirmText: $localize`Reload`,
        cancelText: $localize`Not now`,
      },
      closed: (confirmed) => {
        this.#dialogOpen = false;
        if (confirmed) this.#window.location.reload();
      },
    });
  }
}

/** Router feature that shows the "application was updated" dialog when a lazy chunk fails to load. */
export function withChunkLoadErrorDialog() {
  return withNavigationErrorHandler((event) => inject(ChunkLoadErrorState).handleNavigationError(event));
}
