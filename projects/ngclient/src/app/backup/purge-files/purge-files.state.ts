import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { defer, finalize, Subscription } from 'rxjs';
import { DuplicatiServer, ListFilesetsResponseItem } from '../../core/openapi';

export type PurgeVersionScope = 'all' | 'current' | 'specific';

@Injectable()
export class PurgeFilesState {
  #dupServer = inject(DuplicatiServer);
  #destroyRef = inject(DestroyRef);
  #versionLoad: Subscription | undefined;

  backupId = signal<string | null>(null);
  versions = signal<ListFilesetsResponseItem[]>([]);
  isLoadingVersions = signal(true);

  selectedVersion = signal<string | null>(null);
  selectedPaths = signal('');
  versionScope = signal<PurgeVersionScope>('all');
  specificVersions = signal<number[]>([]);

  selectedPathsArray = computed(() =>
    this.selectedPaths()
      .split('\0')
      .filter((x) => x.trim() !== '')
  );

  selectedVersionItem = computed(() => {
    const version = this.selectedVersion();
    if (version === null) return null;

    return this.versions().find((x) => x.Version === parseInt(version)) ?? null;
  });

  init(backupId: string) {
    if (this.#destroyRef.destroyed || this.backupId() === backupId) return;
    this.#versionLoad?.unsubscribe();
    if (this.backupId() !== null) {
      this.selectedVersion.set(null);
      this.selectedPaths.set('');
      this.versionScope.set('all');
      this.specificVersions.set([]);
    }
    this.versions.set([]);

    this.backupId.set(backupId);
    this.isLoadingVersions.set(true);

    this.#versionLoad = defer(() => this.#dupServer.postApiV2BackupListFilesets({ body: { BackupId: backupId } }))
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.isLoadingVersions.set(false))
      )
      .subscribe({
        next: (res) => {
          const data = (res.Data ?? []).slice().sort((a, b) => (a.Time < b.Time ? 1 : a.Time > b.Time ? -1 : 0));
          this.versions.set(data);
          this.isLoadingVersions.set(false);

          // Select the latest version (v0) automatically
          const latest = data.find((x) => x.Version === 0) ?? data[0];
          if (latest && this.selectedVersion() === null) {
            this.selectedVersion.set(latest.Version.toString());
          }
        },
        error: () => this.isLoadingVersions.set(false),
      });
  }
}
