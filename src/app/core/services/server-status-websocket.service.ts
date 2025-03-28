import { inject, Injectable, signal } from '@angular/core';
import { SparkleDialogService } from '@sparkle-ui/core';
import { DisconnectedDialogComponent } from '../components/disconnected-dialog/disconnected-dialog.component';
import { ServerStatusDto } from '../openapi'; // Adjust import based on your OpenAPI generated types
import { AppAuthState } from '../states/app-auth.state';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class ServerStatusWebSocketService {
  #auth = inject(AppAuthState);
  dialog = inject(SparkleDialogService);
  #websocket: WebSocket | null = null;

  #connectionStatus = signal<ConnectionStatus>('disconnected');
  #serverState = signal<ServerStatusDto | null>(null);
  #disconnectedDialog: ReturnType<typeof this.dialog.open<DisconnectedDialogComponent>> | undefined = undefined;

  shouldConnect = signal(true);
  connectionStatus = this.#connectionStatus.asReadonly();
  serverState = this.#serverState.asReadonly();

  start() {
    this.#connect();

    this.shouldConnect.set(true);
  }

  #connect(): void {
    const token = this.#auth.token();

    if (!token) {
      console.error('No access token available');
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let port = window.location.port ? `:${window.location.port}` : '';

    if (window.location.port === '4200') {
      port = ':8200';
    }

    const hostname = window.location.hostname;
    const url = `${protocol}//${hostname}${port}/notifications?token=${token}`;

    this.#connectionStatus.set('connecting');

    this.#websocket = new WebSocket(url);

    this.#websocket.onopen = () => {
      console.log('WebSocket connection established');
      this.#connectionStatus.set('connected');

      if (this.#disconnectedDialog) {
        this.#disconnectedDialog.close();
      }
    };

    this.#websocket.onmessage = (event) => {
      try {
        const status: ServerStatusDto = JSON.parse(event.data);
        this.#serverState.set(status);
      } catch (error) {
        console.error('Error parsing WebSocket message', error);
      }
    };

    this.#websocket.onclose = (event) => {
      console.log('WebSocket connection closed', event);
      this.#connectionStatus.set('disconnected');

      // Attempt reconnection
      if (this.shouldConnect()) {
        if (!this.#disconnectedDialog) {
          this.#disconnectedDialog = this.dialog.open(DisconnectedDialogComponent, {
            closeOnButton: false,
            closeOnEsc: false,
            closeOnOutsideClick: false,
          });
          this.#disconnectedDialog.component.reconnectTimer.set(15000);
        }

        setTimeout(() => this.#connect(), 5000);
      }
    };

    this.#websocket.onerror = (error) => {
      console.error('WebSocket error', error);
      this.#connectionStatus.set('disconnected');
    };
  }

  stop() {
    this.shouldConnect.set(false);
    this.#websocket?.close();
  }

  reconnect(): void {
    this.#websocket?.close();
    this.start();
  }

  reconnectIfNeeded() {
    if (this.#websocket?.readyState === WebSocket.OPEN) {
      return;
    }

    this.reconnect();
  }
}
