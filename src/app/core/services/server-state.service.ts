import { computed, inject, Injectable, signal } from '@angular/core';
import { ServerStatusLongPollService } from './server-status-longpoll.service';
import { ServerStatusWebSocketService } from './server-status-websocket.service';

type ConnectionMethod = 'websocket' | 'longpoll';
type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class ServerStateService {
  #wsService = inject(ServerStatusWebSocketService);
  #longPollService = inject(ServerStatusLongPollService);

  #connectionMethod = signal<ConnectionMethod>('websocket');
  connectionStatus = computed(() => {
    const method = this.#connectionMethod();

    if (method === 'websocket') {
      return this.#wsService.connectionStatus();
    }

    return this.#longPollService.connectionStatus();
  });

  serverState = computed(() =>
    this.#connectionMethod() === 'websocket' ? this.#wsService.serverState() : this.#longPollService.serverState()
  );

  setConnectionMethod(method: ConnectionMethod) {
    if (method === 'websocket') {
      this.#wsService.reconnectIfNeeded();
      this.#longPollService.stop();
    } else {
      this.#longPollService.reconnectIfNeeded();
      this.#wsService.stop();
    }

    this.#connectionMethod.set(method);
  }

  getConnectionMethod(): ConnectionMethod {
    return this.#connectionMethod();
  }
}
