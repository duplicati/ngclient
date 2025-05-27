import { computed, inject, Injectable, signal } from '@angular/core';
import { ServerStatusLongPollService } from './server-status-longpoll.service';
import { ServerStatusWebSocketService, SubscriptionService } from './server-status-websocket.service';

type ConnectionMethod = 'websocket' | 'longpoll';

@Injectable({
  providedIn: 'root',
})
export class ServerStateService {
  #wsService = inject(ServerStatusWebSocketService);
  #longPollService = inject(ServerStatusLongPollService);

  #connectionMethod = signal<ConnectionMethod>('longpoll');
  #isConnectionMethodSet = signal<boolean>(false);

  connectionStatus = computed(() => {
    const method = this.#connectionMethod();

    if (method === 'websocket') {
      return this.#wsService.connectionStatus();
    }

    return this.#longPollService.connectionStatus();
  });

  isConnectionMethodSet = this.#isConnectionMethodSet.asReadonly();

  serverState = computed(() =>
    this.#connectionMethod() === 'websocket' ? this.#wsService.serverState() : this.#longPollService.serverState()
  );

  progressState = computed(() => this.#wsService.serverProgress());
  taskQueueState = computed(() => this.#wsService.serverTaskQueue());
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
}
