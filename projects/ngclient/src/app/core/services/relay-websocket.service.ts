import { effect, inject, Injectable, signal } from '@angular/core';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { randomUUID } from '../functions/crypto';

type SocketProtocolState = 'disconnected' | 'connecting' | 'connect' | 'welcome' | 'authenticated' | 'error';

type MessageType = 'authportal' | 'list' | 'welcome' | 'command' | 'warning' | 'auth';

type MessageEnvelope = {
  from: string;
  to: string;
  type: MessageType;
  messageId: string;
  payload: string | null;
  errorMessage?: string;
};

type AuthRequestMessage = {
  token: string;
  publicKey: string;
  clientVersion: string;
  protocolVersion: number;
};

type AuthResponseMessage = {
  accepted: boolean | null;
  willReplaceToken: boolean | null;
  newToken: string | null;
};

export type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

type CommandRequest = {
  method: RequestMethod;
  path: string;
  requestBody: string | null;
  headers: { [key: string]: string } | null;
};

type PromiseResolver = {
  resolve: (value: CommandResponse | PromiseLike<CommandResponse>) => void;
  reject: (reason?: any) => void;
  timer: number;
};

export type CommandResponse = {
  code: number;
  requestBody: string | null;
  headers: { [key: string]: string } | null;
};

const ClientVersion = '1.0.0';
const ClientId = `portal-proxy-client-${randomUUID()}`;
const ProtocolVersion = 1;

@Injectable({
  providedIn: 'root',
})
export class RelayWebsocketService {
  #MIN_POLL_INTERVAL = 1000;
  #env = inject(ENVIRONMENT_TOKEN);
  #wsState = signal<SocketProtocolState>('disconnected');
  #reconnectInterval = signal<number | null>(this.#MIN_POLL_INTERVAL);
  #isReconnecting = signal(false);
  #isConnectedToMachineServer = signal(false);
  #reconnectToken = signal<string | null>(null);

  isConnectedToMachineServer = this.#isConnectedToMachineServer.asReadonly();
  wsState = this.#wsState.asReadonly();

  #queuedCommands: MessageEnvelope[] = [];
  #pendingCommands: { [key: string]: PromiseResolver } = {};
  #ws: WebSocket | null = null;
  #textDecoder = new TextDecoder('utf-8');
  #activeInterval: number | null = null;

  #e = effect(() => {
    const isReconnecting = this.#isReconnecting();
    const reconnectInterval = this.#reconnectInterval();
    const reconnectToken = this.#reconnectToken();

    if (!reconnectToken || !isReconnecting || !reconnectInterval || reconnectInterval < this.#MIN_POLL_INTERVAL) {
      this.#activeInterval && window.clearInterval(this.#activeInterval);
      return;
    }

    this.#activeInterval = window.setInterval(() => {
      this.connectToMachineServer(reconnectToken);
    }, reconnectInterval);
  });

  utf8Atob(str: string) {
    const decodedData = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

    const stringifiedJson = this.#textDecoder.decode(decodedData);
    if (stringifiedJson) return JSON.parse(stringifiedJson);
    else return null;
  }

  connectToMachineServer(token: string, options?: { reconnect?: boolean }) {
    const reconnect = options?.reconnect ?? false;
    const state = this.wsState();

    if (state === 'disconnected' || state === 'error' || reconnect) {
      this.#ws?.close();
      this.#ws = null;
    }

    if (this.#ws) return;

    this.#ws = new WebSocket(this.#env.machineServerUrl);
    this.#wsState.set('connecting');

    this.#ws.onopen = () => {
      this.#wsState.set('connect');
      this.#isConnectedToMachineServer.set(true);
      this.#isReconnecting.set(false);
      this.#reconnectToken.set(null);
    };

    this.#ws.onclose = () => {
      // Should we reconnect automatically?
      this.#wsState.set('disconnected');
      this.#isConnectedToMachineServer.set(false);
      this.#reconnectToken.set(token);
      this.#isReconnecting.set(true);
    };

    this.#ws.onerror = () => {
      this.#wsState.set('error');
    };

    this.#ws.onmessage = (event) => {
      const data = JSON.parse(event.data) as MessageEnvelope;

      if (this.wsState() === 'connect') {
        if (data.type !== 'welcome') {
          this.disconnectFromMachineServer(`Unexpected message type, expected 'welcome' but got '${data.type}'`);
          return;
        }

        const authContent: AuthRequestMessage = {
          token: token,
          publicKey: '',
          clientVersion: ClientVersion,
          protocolVersion: ProtocolVersion,
        };
        const authRequest = this.createResponse(data, 'authportal', authContent);
        this.#wsState.set('welcome');
        this.#ws?.send(authRequest);
      } else if (this.wsState() === 'welcome') {
        if (data.type !== 'authportal') {
          this.disconnectFromMachineServer(`Unexpected message type, expected 'authportal' but got '${data.type}'`);
          return;
        }

        var payload = JSON.parse(data.payload ?? '') as AuthResponseMessage;
        if (payload.accepted === false) {
          this.disconnectFromMachineServer('Authentication failed');
          return;
        }

        this.#wsState.set('authenticated');
        this.#isConnectedToMachineServer.set(true);

        // Send queued commands
        while (this.#queuedCommands.length > 0) {
          const message = this.#queuedCommands.pop();
          // Only send if this request has not timed out yet
          if (message && this.#pendingCommands[message.messageId]) this.activateCommand(message);
        }
      } else if (this.wsState() === 'authenticated') {
        if (data.type !== 'command') {
          console.warn(`Unexpected message type, expected 'command' but got '${data.type}'`);
          return;
        }

        const f = this.#pendingCommands[data.messageId];
        if (f) {
          if (data.errorMessage) {
            f.reject(data.errorMessage);
            return;
          } else {
            const payload = JSON.parse(data.payload ?? '') as CommandResponse;
            payload.requestBody = payload?.requestBody == null ? null : this.utf8Atob(payload.requestBody);
            f.resolve(payload);
          }

          delete this.#pendingCommands[data.messageId];
          window.clearTimeout(f.timer);
        }
      }
    };
  }

  private disconnectFromMachineServer(errorMessage: string | null = null) {
    if (errorMessage) console.error(errorMessage);

    this.#ws?.close();
    this.#ws = null;
    this.#wsState.set('disconnected');
    this.#isConnectedToMachineServer.set(false);
  }

  private createResponse(request: MessageEnvelope, type: MessageType, payload: any) {
    const response: MessageEnvelope = {
      from: ClientId,
      to: request.from,
      type: type,
      messageId: request.messageId,
      payload: JSON.stringify(payload),
    };

    return JSON.stringify(response);
  }

  sendCommand(
    token: string,
    clientId: string,
    method: RequestMethod,
    path: string,
    requestBody: string | null,
    headers: { [key: string]: string } | null,
    timeout: number = 5000
  ) {
    if (this.wsState() === 'disconnected' || this.wsState() === 'error') {
      // Connect to the machine server if we are not connected
      this.connectToMachineServer(token);
    }

    return new Promise<CommandResponse>((resolve, reject) => {
      const messageId = randomUUID();

      const request: CommandRequest = {
        method,
        path,
        requestBody,
        headers,
      };

      const message: MessageEnvelope = {
        from: ClientId,
        to: clientId,
        type: 'command',
        messageId: messageId,
        payload: JSON.stringify(request),
      };

      const f: PromiseResolver = {
        resolve,
        reject,
        timer: window.setTimeout(() => {
          const f = this.#pendingCommands[messageId];
          if (f) {
            delete this.#pendingCommands[messageId];
            f.reject('Timeout');
          }
        }, timeout),
      };

      this.#pendingCommands[messageId] = f;

      // If we are not yet connected to the machine server, queue the command
      if (this.#isConnectedToMachineServer()) this.activateCommand(message);
      else this.#queuedCommands.push(message);
    });
  }

  private activateCommand(message: MessageEnvelope) {
    this.#ws?.send(JSON.stringify(message));
  }
}
