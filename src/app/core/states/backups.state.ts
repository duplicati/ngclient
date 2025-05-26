import { inject, Injectable, signal } from '@angular/core';
import { finalize, take, tap } from 'rxjs';
import { randomUUID } from '../functions/crypto';
import { DeleteApiV1BackupByIdData, DuplicatiServerService } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
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

const LOCALSTORAGE_BACKUP_LIST_ORDER_BY = 'backupListOrderBy';
const LOCALSTORAGE_BACKUP_LIST_SHOW_ACTUAL_TIMES = 'backupListShowActualTimes';

const SORT_OPTIONS = [
  {
    value: 'id',
    label: $localize`Backup ID`,
  },
  {
    value: 'name',
    label: $localize`Backup name`,
  },
  {
    value: 'lastrun',
    label: $localize`Last run time`,
  },
  {
    value: 'nextrun',
    label: $localize`Next run time`,
  },
  {
    value: 'schedule',
    label: $localize`Is scheduled`,
  },
  {
    value: 'backend',
    label: $localize`Destination type`,
  },
  {
    value: 'sourcesize',
    label: $localize`Source size`,
  },
  {
    value: 'destinationsize',
    label: $localize`Destination size`,
  },
  {
    value: 'duration',
    label: $localize`Duration`,
  },
  {
    value: '-id',
    label: $localize`Backup ID (decending)`,
  },
  {
    value: '-name',
    label: $localize`Backup name (decending)`,
  },
  {
    value: '-lastrun',
    label: $localize`Last run time (decending)`,
  },
  {
    value: '-nextrun',
    label: $localize`Next run time (decending)`,
  },
  {
    value: '-schedule',
    label: $localize`Is scheduled (decending)`,
  },
  {
    value: '-backend',
    label: $localize`Destination type (decending)`,
  },
  {
    value: '-sourcesize',
    label: $localize`Source size (decending)`,
  },
  {
    value: '-destinationsize',
    label: $localize`Destination size (decending)`,
  },
  {
    value: '-duration',
    label: $localize`Duration (decending)`,
  },
] as const;
export type OrderBy = (typeof SORT_OPTIONS)[number]['value'];
export type TimeType = 'actual' | 'relative';

@Injectable({
  providedIn: 'root',
})
export class BackupsState {
  #ls = inject(LOCALSTORAGE);
  #dupServer = inject(DuplicatiServerService);
  #timestamp: number | null = null;
  #draftBackups = signal<BackupDraftItem[]>([]);
  #backups = signal<BackupRes>([]);
  #backupsLoading = signal(false);
  #startingBackup = signal<string | null>(null);
  #deletingBackup = signal<string | null>(null);

  #timeType = signal<TimeType>(
    this.#ls.getItemParsed<TimeType>(LOCALSTORAGE_BACKUP_LIST_SHOW_ACTUAL_TIMES, true) ?? 'relative'
  );
  #orderBy = signal(this.#ls.getItemParsed<OrderBy>(LOCALSTORAGE_BACKUP_LIST_ORDER_BY, true) ?? 'id');

  orderByOptions = signal(SORT_OPTIONS);
  orderBy = this.#orderBy.asReadonly();
  backups = this.#backups.asReadonly();
  timeType = this.#timeType.asReadonly();
  backupsLoading = this.#backupsLoading.asReadonly();
  startingBackup = this.#startingBackup.asReadonly();
  deletingBackup = this.#deletingBackup.asReadonly();
  draftBackups = this.#draftBackups.asReadonly();

  addDraftBackup(backup: BackupDraft) {
    const backupDraftId = randomUUID();

    this.#draftBackups.set([
      ...this.#draftBackups(),
      {
        id: backupDraftId,
        data: backup,
      },
    ]);

    return backupDraftId;
  }

  setOrderBy(orderBy: OrderBy) {
    this.#ls.setItemParsed(LOCALSTORAGE_BACKUP_LIST_ORDER_BY, orderBy, true);
    this.#orderBy.set(orderBy);
    this.getBackups(true);
  }

  setTimeType(timeType: TimeType) {
    this.#ls.setItemParsed(LOCALSTORAGE_BACKUP_LIST_SHOW_ACTUAL_TIMES, timeType, true);
    this.#timeType.set(timeType);
  }

  removeDraftBackupById(id: string) {
    this.#draftBackups.set(this.#draftBackups().filter((x) => x.id !== id));
  }

  getBackupById(id: string) {
    return this.#backups().find((x) => x.Backup?.ID === id) ?? null;
  }

  getBackups(forceRefresh = false) {
    const timestamp = this.#timestamp;
    const now = Date.now();
    const cacheTimeLimit = timestamp && now - timestamp < 15 * 60 * 1000;
    const preventMultipleRequests = timestamp && now - timestamp < 100;

    if (preventMultipleRequests || (!forceRefresh && cacheTimeLimit && this.#backups().length)) {
      return;
    }

    this.#timestamp = now;
    this.#backupsLoading.set(true);
    this.#dupServer
      .getApiV1Backups({
        orderBy: this.#orderBy(),
      })
      .pipe(
        take(1),
        tap((res) => this.#backups.set(res)),
        finalize(() => this.#backupsLoading.set(false))
      )
      .subscribe();
  }

  startBackup(id: string) {
    this.#startingBackup.set(id);

    this.#dupServer
      .postApiV1BackupByIdStart({
        id,
      })
      .pipe(
        take(1),
        tap(() => this.getBackups(true)),
        finalize(() => this.#startingBackup.set(null))
      )
      .subscribe();
  }

  deleteBackup(deleteConfig: DeleteApiV1BackupByIdData) {
    return this.#dupServer.deleteApiV1BackupById(deleteConfig).pipe(take(1));
  }
}
