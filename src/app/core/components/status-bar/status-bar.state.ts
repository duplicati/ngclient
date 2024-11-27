import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { finalize, map, of, switchMap } from 'rxjs';
import {
  DuplicatiServerService,
  GetApiV1ProgressstateResponse,
  GetApiV1ServerstateData,
  GetApiV1TaskByTaskidResponse,
  ProgressStateService,
  ServerStatusDto,
} from '../../openapi';
import { Backup, BackupsState } from '../../states/backups.state';

type Task = GetApiV1TaskByTaskidResponse;

export type Status = GetApiV1ProgressstateResponse & {
  task?: Task | null;
  backup?: Backup | null;
};

@Injectable({
  providedIn: 'root',
})
export class StatusBarState {
  #MIN_POLL_INTERVAL = 1000;
  #progState = inject(ProgressStateService);
  #dupServer = inject(DuplicatiServerService);
  #backupState = inject(BackupsState);
  #isPollingProgressState = signal(false);
  #isFetching = signal(false);
  #progressStatePollingInterval = signal<number | null>(this.#MIN_POLL_INTERVAL);
  #statusData = signal<Status | null>(null);
  #isGettingServerState = signal(false);
  #serverStateLoading = signal(false);
  #serverState = signal<ServerStatusDto | null>(null);
  #blocker = signal<boolean>(false);

  statusData = this.#statusData.asReadonly();
  serverState = computed(() => {
    const serverState = this.#serverState();

    if (!serverState) return null;

    serverState.ProposedSchedule = serverState?.ProposedSchedule?.map((x) => {
      const backup = x.Item1 ? this.#backupState.getBackupById(x.Item1) : null;

      return {
        ...x,
        backup,
      };
    });

    return serverState;
  });
  isFetching = this.#isFetching.asReadonly();

  #activeInterval: number | null = null;

  #polling = effect(() => {
    const isPollingProgressState = this.#isPollingProgressState();
    const progressStatePollingInterval = this.#progressStatePollingInterval();

    if (
      !isPollingProgressState ||
      !progressStatePollingInterval ||
      progressStatePollingInterval < this.#MIN_POLL_INTERVAL
    ) {
      this.#activeInterval && window.clearInterval(this.#activeInterval);
      return;
    }

    this.#activeInterval = window.setInterval(() => {
      this.#getProgressState();
    }, progressStatePollingInterval);
  });

  start() {
    this.#isGettingServerState.set(true);
    this.#getServerState();
  }

  stop() {
    this.#isGettingServerState.set(false);
  }

  startPollingProgress() {
    this.#getProgressState();
    this.#isPollingProgressState.set(true);
  }

  stopPollingProgress() {
    this.#isPollingProgressState.set(false);
  }

  setProgressStatePollingInterval(time: number) {
    if (time < this.#MIN_POLL_INTERVAL) {
      console.error(`Polling interval must be at least ${this.#MIN_POLL_INTERVAL}ms`);

      return;
    }

    this.#progressStatePollingInterval.set(time);
  }

  serverStateEffect = effect(() => {
    if (this.#blocker()) {
      this.stopPollingProgress();
      return;
    }

    if (!this.#serverStateLoading() && this.#isGettingServerState()) {
      setTimeout(() => {
        this.startPollingProgress();
        this.#getServerState();
      }, 1000);
    } else {
      this.stopPollingProgress();
    }
  });

  #getServerState() {
    if (this.#serverStateLoading()) return;

    this.#serverStateLoading.set(true);
    const lastEventId = this.#serverState()?.LastEventID;

    const params: GetApiV1ServerstateData =
      lastEventId === null || lastEventId === undefined
        ? {}
        : {
            lastEventId: lastEventId,
            longpoll: true,
            duration: '299s',
          };

    this.#dupServer
      .getApiV1Serverstate(params)
      .pipe(finalize(() => this.#serverStateLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (this.#serverState()?.LastDataUpdateID !== res.LastDataUpdateID) {
            this.#backupState.getBackups();
          }

          this.#serverState.set(res);
        },
      });
  }

  #getProgressState() {
    this.#isFetching.set(true);
    this.#progState
      .getApiV1Progressstate()
      .pipe(
        switchMap((x) => {
          const taskId = x.TaskID ?? null;

          if (taskId === null) return of(x);

          return this.#dupServer
            .getApiV1TaskByTaskid({
              taskid: taskId,
            })
            .pipe(map((res) => ({ ...x, task: res ?? null })));
        }),
        finalize(() => this.#isFetching.set(false))
      )
      .subscribe({
        next: (res: Status) => {
          const taskId = res.TaskID ?? null;
          const backupId = res.BackupID ?? null;

          if (taskId !== null && backupId !== null) {
            const backup = this.#backupState.getBackupById(backupId);

            res.backup = backup;
          }

          if (res.task?.Status === 'Completed') {
            this.#isPollingProgressState.set(false);
          } else {
            this.#isPollingProgressState.set(true);
          }

          this.#statusData.set(res);
        },
        error: (err) => {
          if (err.status === 404) {
            this.#isPollingProgressState.set(false);
          }
        },
      });
  }
}
