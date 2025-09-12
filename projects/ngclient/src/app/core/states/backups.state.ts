import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize, take, tap } from 'rxjs';
import { randomUUID } from '../functions/crypto';
import { localStorageSignal } from '../functions/localstorage-signal';
import { DeleteApiV1BackupByIdData, DuplicatiServer } from '../openapi';
import { ServerStateService } from '../services/server-state.service';
import { Subscribed } from '../types/subscribed';
import { SysinfoState } from './sysinfo.state';

export type BackupRes = Subscribed<ReturnType<DuplicatiServer['getApiV1Backups']>>;
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
    label: $localize`Backup ID (descending)`,
  },
  {
    value: '-name',
    label: $localize`Backup name (descending)`,
  },
  {
    value: '-lastrun',
    label: $localize`Last run time (descending)`,
  },
  {
    value: '-nextrun',
    label: $localize`Next run time (descending)`,
  },
  {
    value: '-schedule',
    label: $localize`Is scheduled (descending)`,
  },
  {
    value: '-backend',
    label: $localize`Destination type (descending)`,
  },
  {
    value: '-sourcesize',
    label: $localize`Source size (descending)`,
  },
  {
    value: '-destinationsize',
    label: $localize`Destination size (descending)`,
  },
  {
    value: '-duration',
    label: $localize`Duration (descending)`,
  },
] as const;
export type OrderBy = (typeof SORT_OPTIONS)[number]['value'];
export type TimeType = 'actual' | 'relative';

@Injectable({
  providedIn: 'root',
})
export class BackupsState {
  #dupServer = inject(DuplicatiServer);
  #sysinfo = inject(SysinfoState);
  #serverState = inject(ServerStateService);
  #timestamp: number | null = null;
  #draftBackups = signal<BackupDraftItem[]>([]);
  #backups = signal<BackupRes>([]);
  #backupsLoading = signal(false);
  #startingBackup = signal<string | null>(null);
  #deletingBackup = signal<string | null>(null);

  #timeType = localStorageSignal<TimeType>(LOCALSTORAGE_BACKUP_LIST_SHOW_ACTUAL_TIMES, 'relative');
  #orderBy = localStorageSignal<OrderBy>(LOCALSTORAGE_BACKUP_LIST_ORDER_BY, 'id');

  orderByOptions = signal(SORT_OPTIONS);
  orderBy = this.#orderBy.asReadonly();
  backups = this.#backups.asReadonly();
  timeType = this.#timeType.asReadonly();
  backupsLoading = this.#backupsLoading.asReadonly();
  startingBackup = this.#startingBackup.asReadonly();
  deletingBackup = this.#deletingBackup.asReadonly();
  draftBackups = this.#draftBackups.asReadonly();

  #hasWebsocketBackupListUpdate = computed(
    () => this.#sysinfo.hasBackupListSubscribeOption() && this.#serverState.getConnectionMethod() === 'websocket'
  );
  #backupListUpdatedEffect = effect(() => {
    const backupList = this.#serverState.backupListState();
    if (backupList) this.#backups.set(backupList);
  });

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
    this.#orderBy.set(orderBy);
    // Prevent fetching backups if the connection method is not yet set
    if (!this.#serverState.isConnectionMethodSet()) return;

    if (this.#hasWebsocketBackupListUpdate()) this.#serverState.subscribe('backuplist', orderBy);
    else this.getBackups(true);
  }

  setTimeType(timeType: TimeType) {
    this.#timeType.set(timeType);
  }

  removeDraftBackupById(id: string) {
    this.#draftBackups.set(this.#draftBackups().filter((x) => x.id !== id));
  }

  getBackupById(id: string) {
    return this.#backups().find((x) => x.Backup?.ID === id) ?? null;
  }

  getBackups(forceRefresh = false) {
    // Prevent fetching backups if the connection method is not yet set
    if (!this.#serverState.isConnectionMethodSet()) return;

    // Subscribe to backup list updates via WebSocket if the server supports it
    if (this.#hasWebsocketBackupListUpdate()) {
      this.#serverState.subscribe('backuplist', this.#orderBy());
      return;
    }

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
