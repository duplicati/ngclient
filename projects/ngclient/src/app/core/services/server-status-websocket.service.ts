import { inject, Injectable, signal } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core';
import { Observable, Subscriber } from 'rxjs';
import { DisconnectedDialogComponent } from '../components/disconnected-dialog/disconnected-dialog.component';
import {
  GetApiV1BackupsResponse,
  GetApiV1ServersettingsResponse,
  GetTaskStateDto,
  IProgressEventData,
  OpenAPI,
  ServerStatusDto,
} from '../openapi';
import { AppAuthState } from '../states/app-auth.state';
import { SysinfoState } from '../states/sysinfo.state';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'authenticating';

export type SubscriptionService =
  | 'backuplist'
  | 'serversettings'
  | 'progress'
  | 'taskqueue'
  | 'taskcompleted'
  | 'notification'
  | 'legacystatus'
  | 'serversettings';
type RequestAction = 'sub' | 'unsub';
type ResponseAction = 'reply';
type ResponseType = SubscriptionService | ResponseAction;

// WebSocketAuthRequest
export type WebSocketAuthRequest = {
  Version: number;
  Token: string;
};

// WebSocketAuthReply
export type WebSocketAuthReply = {
  Version: number;
  Message: string;
  Success: boolean;
};

// WebSocketRequest without generic data
type WebSocketRequest = {
  Version: number;
  Id: string;
  Action: RequestAction;
  Service?: SubscriptionService | null;
};

// Generic WebSocketRequest with payload
type WebSocketRequestWithData = WebSocketRequest & {
  Data: any;
};

// WebSocketReply structure
type WebSocketReply = {
  Version: number;
  Id: string;
  Service?: SubscriptionService | null;
  Message: string;
  Success: boolean;
  Type: ResponseAction;
  Data?: any | null;
};

// Generic WebsocketEventMessage
type WebsocketEventMessage<T extends object> = {
  Type: string;
  ApiVersion: number;
  Data: T;
};

const LOGGING_ENABLED = false;

@Injectable({
  providedIn: 'root',
})
export class ServerStatusWebSocketService {
  #auth = inject(AppAuthState);
  #sysinfo = inject(SysinfoState);
  dialog = inject(ShipDialogService);
  #websocket: WebSocket | null = null;

  #connectionStatus = signal<ConnectionStatus>('disconnected');
  #serverState = signal<ServerStatusDto | null>(null);
  #serverProgress = signal<IProgressEventData | null>(null);
  #serverSettings = signal<GetApiV1ServersettingsResponse | null>(null);
  #serverTaskQueue = signal<GetTaskStateDto[] | null>(null);
  #backupListState = signal<GetApiV1BackupsResponse | null>(null);
  #disconnectedDialog: ReturnType<typeof this.dialog.open<DisconnectedDialogComponent>> | undefined = undefined;
  #subscriptions = signal<Partial<{ [key in SubscriptionService]: any }>>({ legacystatus: true });

  shouldConnect = signal(true);
  connectionStatus = this.#connectionStatus.asReadonly();
  serverState = this.#serverState.asReadonly();
  serverProgress = this.#serverProgress.asReadonly();
  serverSettings = this.#serverSettings.asReadonly();
  subscriptions = this.#subscriptions.asReadonly();
  serverTaskQueue = this.#serverTaskQueue.asReadonly();
  backupListState = this.#backupListState.asReadonly();
  #taskCompletedSubscriber: Subscriber<GetTaskStateDto> | null = null;
  taskCompleted = new Observable<GetTaskStateDto>((subscriber) => {
    this.#taskCompletedSubscriber = subscriber;
  });
  #reqidCounter = 0;

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
    const prefix = OpenAPI.BASE || '';
    const url = this.#sysinfo.hasWebSocketAuth()
      ? `${protocol}//${hostname}${port}${prefix}/notifications`
      : `${protocol}//${hostname}${port}${prefix}/notifications?token=${token}`;

    this.#connectionStatus.set('connecting');

    this.#websocket = new WebSocket(url);

    this.#websocket.onopen = () => {
      if (LOGGING_ENABLED) console.log('WebSocket connection established');

      if (this.#sysinfo.hasWebSocketAuth()) {
        this.#connectionStatus.set('authenticating');
        this.#websocket?.send(
          JSON.stringify({
            Version: 1,
            Token: token,
          } as WebSocketAuthRequest)
        );
      } else {
        this.#onconnectionEstablished();
      }
    };

    this.#websocket.onmessage = (event) => {
      if (this.#connectionStatus() === 'authenticating') {
        try {
          const authReply = JSON.parse(event.data) as WebSocketAuthReply;
          if (authReply.Success) {
            if (LOGGING_ENABLED) console.log('WebSocket authentication successful');
            this.#onconnectionEstablished();
          } else {
            console.error('WebSocket authentication failed:', authReply.Message);
            this.#connectionStatus.set('disconnected');
          }
          return;
        } catch (error) {
          console.error('Error parsing WebSocket authentication reply', error);
          this.#connectionStatus.set('disconnected');
          return;
        }
      }

      try {
        const respobj = JSON.parse(event.data);
        const type = respobj?.Type as ResponseType | null;

        if (type === 'legacystatus' || type == null) {
          if (LOGGING_ENABLED) console.log('Received legacy status update:', respobj);
          this.#serverState.set(respobj as ServerStatusDto);
        } else if (type === 'reply') {
          const reply = respobj as WebSocketReply;
          if (!reply.Success) console.error('WebSocket reply error:', reply.Message);
        } else if (type === 'progress') {
          const evobj = respobj as WebsocketEventMessage<IProgressEventData>;
          if (LOGGING_ENABLED) console.log('Received progress update:', evobj.Data);
          this.#serverProgress.set(evobj.Data);
        } else if (type === 'serversettings') {
          const evobj = respobj as WebsocketEventMessage<GetApiV1ServersettingsResponse>;
          if (LOGGING_ENABLED) console.log('Received server settings update:', evobj.Data);
          this.#serverSettings.set(evobj.Data);
        } else if (type === 'taskqueue') {
          const evobj = respobj as WebsocketEventMessage<GetTaskStateDto[]>;
          if (LOGGING_ENABLED) console.log('Received task update:', evobj.Data);
          this.#serverTaskQueue.set(evobj.Data);
        } else if (type === 'taskcompleted') {
          const evobj = respobj as WebsocketEventMessage<GetTaskStateDto>;
          if (LOGGING_ENABLED) console.log('Received task completed:', evobj.Data);
          this.#taskCompletedSubscriber?.next(evobj.Data);
        } else if (type === 'backuplist') {
          const evobj = respobj as WebsocketEventMessage<GetApiV1BackupsResponse>;
          if (LOGGING_ENABLED) console.log('Received backup list update:', evobj.Data);
          this.#backupListState.set(evobj.Data);
        } else {
          console.warn('Unknown WebSocket message type:', type);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message', error);
      }
    };

    this.#websocket.onclose = (event) => {
      if (LOGGING_ENABLED) console.log('WebSocket connection closed', event);
      this.#connectionStatus.set('disconnected');

      var shouldReAuthenticate = event.code === 4401;
      if (shouldReAuthenticate) {
        this.#auth.refreshToken().subscribe({
          next: () => {
            this.reconnect();
          },
          error: (error) => {
            console.error('Error refreshing token', error);
          },
        });
      }

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

  #onconnectionEstablished() {
    this.#connectionStatus.set('connected');

    const pendingSubscriptions = this.#subscriptions();
    if (Object.keys(pendingSubscriptions).length > 0) {
      Object.entries(pendingSubscriptions).forEach(([subscriptionId, value]) => {
        if (value != null) {
          this.sendSubscribeRequest<object>(subscriptionId as SubscriptionService, value);
        }
      });
    }
    if (this.#disconnectedDialog) {
      this.#disconnectedDialog.close();
    }
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

  private sendSubscribeRequest<T>(subscriptionId: SubscriptionService, data: T | undefined | null) {
    this.#websocket?.send(
      JSON.stringify({
        Version: 1,
        Id: `req-${++this.#reqidCounter}`,
        Action: 'sub',
        Service: subscriptionId,
        Data: data || null,
      } as WebSocketRequestWithData)
    );
  }

  subscribe(subscriptionId: SubscriptionService, data: any = undefined) {
    const currentSubscriptions = this.#subscriptions();
    const current = currentSubscriptions[subscriptionId];

    if (!current || JSON.stringify(current) !== JSON.stringify(data || true)) {
      currentSubscriptions[subscriptionId] = data || true;
      this.#subscriptions.set(currentSubscriptions);

      if (this.#connectionStatus() == 'connected') this.sendSubscribeRequest(subscriptionId, data);
    }
  }

  unsubscribe(subscriptionId: SubscriptionService) {
    const currentSubscriptions = this.#subscriptions();
    if (currentSubscriptions[subscriptionId]) {
      delete currentSubscriptions[subscriptionId];
      this.#subscriptions.set(currentSubscriptions);

      if (this.#connectionStatus() == 'connected')
        this.#websocket?.send(
          JSON.stringify({
            Version: 1,
            Id: `req-${++this.#reqidCounter}`,
            Action: 'unsub',
            Service: subscriptionId,
          } as WebSocketRequest)
        );
    }
  }
}
