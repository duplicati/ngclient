import { inject, Injectable, signal } from '@angular/core';
import { finalize, take } from 'rxjs';
import { DuplicatiServerService } from '../openapi';
import { Subscribed } from '../types/subscribed';

export type BackupRes = Subscribed<ReturnType<DuplicatiServerService['getApiV1Backups']>>;
export type Backup = BackupRes[0];

export type BackupDraftItem = {
  id: string;
  data: BackupDraft;
};

export type BackupDraft = Backup & {
  CreatedByVersion: string;
  DisplayNames: { [key: string]: string };
};

@Injectable({
  providedIn: 'root',
})
export class BackupsState {
  #dupServer = inject(DuplicatiServerService);
  #timestamp: number | null = null;
  #draftBackups = signal<BackupDraftItem[]>([]);
  #backups = signal<BackupRes>([]);
  #backupsLoading = signal(false);

  backups = this.#backups.asReadonly();
  backupsLoading = this.#backupsLoading.asReadonly();
  draftBackups = this.#draftBackups.asReadonly();

  addDraftBackup(backup: BackupDraft) {
    const backupDraftId = crypto.randomUUID();

    this.#draftBackups.set([
      ...this.#draftBackups(),
      {
        id: backupDraftId,
        data: backup,
      },
    ]);

    return backupDraftId;
  }

  removeDraftBackupById(id: string) {
    this.#draftBackups.set(this.#draftBackups().filter((x) => x.id !== id));
  }

  getBackupById(id: string) {
    return this.#backups().find((x) => x.Backup?.ID === id) ?? null;
  }

  getBackups(refresh = false) {
    if (this.#timestamp && Date.now() - this.#timestamp < 100) {
      return;
    }

    this.#timestamp = Date.now();

    this.#backupsLoading.set(true);

    this.#dupServer
      .getApiV1Backups()
      .pipe(
        take(1),
        finalize(() => this.#backupsLoading.set(false))
      )
      .subscribe({
        next: (res) => {
          this.#backups.set(res);
        },
        error: (err) => {
          console.error(err);
        },
      });
  }

  startBackup(id: string) {
    this.#dupServer
      .postApiV1BackupByIdStart({
        id,
      })
      .subscribe({
        next: () => {
          this.getBackups();
        },
      });
  }

  deleteBackup(id: string) {
    this.#dupServer
      .deleteApiV1BackupById({
        id,
      })
      .subscribe({
        next: () => {
          this.getBackups();
        },
      });
  }
}
