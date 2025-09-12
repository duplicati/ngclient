import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, Subscriber } from 'rxjs';
import { DuplicatiServer, GetTaskStateDto } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStatusLongPollService } from './server-status-longpoll.service';
import { ServerStatusWebSocketService, SubscriptionService } from './server-status-websocket.service';

type ConnectionMethod = 'websocket' | 'longpoll';
const RECENT_COMPLETED_TASKS = 10;
@Injectable({
  providedIn: 'root',
})
export class ServerStateService {
  #wsService = inject(ServerStatusWebSocketService);
  #longPollService = inject(ServerStatusLongPollService);
  #dupServer = inject(DuplicatiServer);
  #sysinfo = inject(SysinfoState);

  #connectionMethod = signal<ConnectionMethod>('longpoll');
  #isConnectionMethodSet = signal<boolean>(false);
  #useWebsocketStateInfo = computed(
    () => this.#sysinfo.hasTaskCompletedOption() && this.#connectionMethod() === 'websocket'
  );

  #waitForTaskItems: Record<number, Subscriber<GetTaskStateDto>[]> = {};
  #pollingTimerId: number | null = null;
  #isPolling: boolean = false;
  #recentCompletedTasks: GetTaskStateDto[] = [];

  constructor() {
    this.#wsService.subscribe('taskcompleted');
    this.#wsService.taskCompleted.subscribe((task) => {
      this.#recentCompletedTasks.unshift(task);
      if (this.#recentCompletedTasks.length > RECENT_COMPLETED_TASKS) this.#recentCompletedTasks.pop();

      if (!task.ID) return;
      const entry = this.#waitForTaskItems[task.ID];

      if (entry) {
        entry.forEach((subscriber) => {
          subscriber.next(task);
          subscriber.complete();
        });
        delete this.#waitForTaskItems[task.ID!];
      }
    });
  }

  connectionStatus = computed(() => {
    const method = this.#connectionMethod();

    if (method === 'websocket') return this.#wsService.connectionStatus();

    return this.#longPollService.connectionStatus();
  });

  isConnectionMethodSet = this.#isConnectionMethodSet.asReadonly();

  serverState = computed(() =>
    this.#connectionMethod() === 'websocket' ? this.#wsService.serverState() : this.#longPollService.serverState()
  );

  progressState = this.#wsService.serverProgress;
  taskQueueState = this.#wsService.serverTaskQueue;

  activeTaskQueueState = computed(() => {
    const method = this.#connectionMethod();
    if (method === 'websocket')
      return (
        this.#wsService
          .serverTaskQueue()
          ?.map((x) => x.ID!)
          .filter((x) => x) ?? []
      );

    return (this.#longPollService.serverState()?.SchedulerQueueIds ?? []).map((x) => x.Item1!).filter((x) => x);
  });

  backupListState = computed(() => this.#wsService.backupListState());

  setConnectionMethod(method: ConnectionMethod) {
    if (method === 'websocket') {
      this.#wsService.reconnectIfNeeded();
      this.#longPollService.stop();
    } else {
      this.#longPollService.reconnectIfNeeded();
      this.#wsService.stop();
    }

    this.#connectionMethod.set(method);
    this.#isConnectionMethodSet.set(true);
  }

  getConnectionMethod(): ConnectionMethod {
    return this.#connectionMethod();
  }

  subscribe(subscriptionId: SubscriptionService, data: any = null) {
    this.#wsService.subscribe(subscriptionId, data);
  }

  unsubscribe(subscriptionId: SubscriptionService) {
    this.#wsService.unsubscribe(subscriptionId);
  }

  waitForTaskToComplete(taskId: number) {
    return new Observable<GetTaskStateDto>((subscriber) => {
      // In case there is a race and the task has already completed
      const existing = this.#recentCompletedTasks.find((task) => task.ID === taskId);
      if (existing) {
        subscriber.next(existing);
        subscriber.complete();
        return;
      }

      this.#waitForTaskItems[taskId] = this.#waitForTaskItems[taskId] || [];
      this.#waitForTaskItems[taskId].push(subscriber);
      this.#startPollingIfNeeded();
    });
  }

  #startPollingIfNeeded() {
    if (this.#isPolling) return;
    if (this.#useWebsocketStateInfo()) return;
    this.#isPolling = true;
    this.#pollOnceAndReschedule();
  }

  #pollOnceAndReschedule() {
    const taskIds = Object.keys(this.#waitForTaskItems).map((id) => parseInt(id, 10));
    if (taskIds.length === 0) {
      this.#stopPolling();
      return;
    }

    const nextTaskId = Math.min(...taskIds);

    this.#dupServer.getApiV1TaskByTaskid({ taskid: nextTaskId }).subscribe({
      next: (task) => {
        const finished = task.TaskFinished != null;

        if (finished) {
          this.#recentCompletedTasks.unshift(task);
          if (this.#recentCompletedTasks.length > RECENT_COMPLETED_TASKS) this.#recentCompletedTasks.pop();

          this.#waitForTaskItems[nextTaskId].forEach((subscriber) => {
            subscriber.next(task);
            subscriber.complete();
          });
          delete this.#waitForTaskItems[nextTaskId];
        }
      },
      complete: () => {
        this.#pollingTimerId = window.setTimeout(() => {
          this.#pollOnceAndReschedule();
        }, 1000);
      },
      error: (err) => {
        this.#pollingTimerId = window.setTimeout(() => {
          this.#pollOnceAndReschedule();
        }, 3000);
      },
    });
  }

  #stopPolling() {
    if (this.#pollingTimerId !== null) {
      clearTimeout(this.#pollingTimerId);
      this.#pollingTimerId = null;
    }
    this.#isPolling = false;
  }
}
