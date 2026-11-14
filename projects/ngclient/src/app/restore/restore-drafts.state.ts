import { inject, Injectable, signal } from '@angular/core';
import { defer } from 'rxjs';
import { DuplicatiServer } from '../core/openapi';

// Same key layout as the LOCALSTORAGE service, so it is removed with the other app keys
const STORAGE_KEY = 'v1:duplicati:restoreDrafts';

export type RestoreDraft = {
  id: string;
  name: string | null;
  targetUrl: string | null;
};

function readIds(): string[] {
  try {
    const ids = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeIds(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the list is only lost, the restore itself still works
  }
}

/**
 * Remembers the temporary backups this browser made for a direct restore, so the user can
 * return to one after leaving the restore pages. Only the IDs are stored; the server lists
 * which temporary backups still exist, and they are gone after a server restart.
 */
@Injectable({
  providedIn: 'root',
})
export class RestoreDraftsState {
  #dupServer = inject(DuplicatiServer);

  drafts = signal<RestoreDraft[]>([]);

  remember(id: string | null | undefined) {
    if (!id) return;
    writeIds([...readIds().filter((x) => x !== id), id]);
  }

  forget(id: string | null | undefined) {
    if (!id) return;
    writeIds(readIds().filter((x) => x !== id));
    this.drafts.update((drafts) => drafts.filter((x) => x.id !== id));
  }

  /** Loads the remembered drafts the server still has, newest first, and forgets the others */
  load() {
    const ids = readIds();
    if (!ids.length) {
      this.drafts.set([]);
      return;
    }

    defer(() => this.#dupServer.getApiV1BackupsTemporary()).subscribe({
      next: (temporaryBackups) => {
        const byId = new Map((temporaryBackups ?? []).filter((x) => !!x.ID).map((x) => [x.ID!, x]));
        const current = readIds();
        const kept = current.filter((id) => byId.has(id) || !ids.includes(id));
        if (kept.length !== current.length) writeIds(kept);

        this.drafts.set(
          kept
            .filter((id) => byId.has(id))
            .reverse()
            .map((id) => ({
              id,
              name: byId.get(id)!.Name || null,
              targetUrl: byId.get(id)!.TargetURL || null,
            }))
        );
      },
      error: () => this.drafts.set([]),
    });
  }
}
