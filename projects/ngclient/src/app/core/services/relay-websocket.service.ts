import { effect, inject, Injectable, signal } from '@angular/core';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import {
  createReplyKeyPair,
  decryptCommandResponse,
  encryptCommandRequest,
  requiresEncryptedCommands,
  type ReplyKeyPair,
} from '../functions/command-payload-encryption';
import { randomUUID } from '../functions/crypto';
import { ConnectingScreenService } from './connecting-screen.service';

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
  body: string | null;
  headers: { [key: string]: string } | null;
};

type PromiseResolver = {
  resolve: (value: CommandResponse | PromiseLike<CommandResponse>) => void;
  reject: (reason?: any) => void;
  timer: number;
  binaryBody: boolean;
  /** Set when the request was encrypted; the response must then be encrypted to this key. */
  replyPrivateKey: CryptoKey | null;
};

/** The client a command is addressed to, with what is needed to encrypt for it. */
export type RelayTarget = {
  clientId: string;
  /** The client's public key (SubjectPublicKeyInfo PEM), as listed by the machine server. */
  publicKey: string | null;
  /** The protocol version the client authenticated with; 2 and later require encrypted commands. */
  protocolVersion: number | null;
};

export type CommandResponse = {
  statusCode: number;
  body: string | null;
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
  #connectingScreen = inject(ConnectingScreenService);
  #wsState = signal<SocketProtocolState>('disconnected');
  #reconnectInterval = signal<number | null>(this.#MIN_POLL_INTERVAL);
  #isReconnecting = signal(false);
  #isConnectedToMachineServer = signal(false);
  #reconnectToken = signal<string | null>(null);
  #reconnectUrl = signal<string | null>(null);
  #hasHandledFirstCommandResponse = false;

  isConnectedToMachineServer = this.#isConnectedToMachineServer.asReadonly();
  wsState = this.#wsState.asReadonly();

  #queuedCommands: MessageEnvelope[] = [];
  #pendingCommands: { [key: string]: PromiseResolver } = {};
  #ws: WebSocket | null = null;
  #textDecoder = new TextDecoder('utf-8');
  #activeInterval: number | null = null;
  /**
   * The key responses are encrypted to. One per page load, kept only in memory, and shared across
   * reconnects so a command queued before a reconnect can still have its response decrypted.
   */
  #replyKeyPair: Promise<ReplyKeyPair> | null = null;

  #e = effect(() => {
    const isReconnecting = this.#isReconnecting();
    const reconnectInterval = this.#reconnectInterval();
    const reconnectToken = this.#reconnectToken();
    const reconnectUrl = this.#reconnectUrl();

    if (
      !reconnectToken ||
      !reconnectUrl ||
      !isReconnecting ||
      !reconnectInterval ||
      reconnectInterval < this.#MIN_POLL_INTERVAL
    ) {
      this.#activeInterval && window.clearInterval(this.#activeInterval);
      return;
    }

    this.#activeInterval = window.setInterval(() => {
      this.connectToMachineServer(reconnectToken, reconnectUrl);
    }, reconnectInterval);
  });

  #showInitialCommandError(message: string) {
    if (this.#hasHandledFirstCommandResponse) return;

    this.#hasHandledFirstCommandResponse = true;
    this.#connectingScreen.showError(message || 'Unable to connect to the server.');
  }

  #markInitialCommandHandled() {
    if (!this.#hasHandledFirstCommandResponse) this.#hasHandledFirstCommandResponse = true;
  }

  utf8Atob(str: string) {
    const decodedData = Uint8Array.from(atob(str), (c) => c.charCodeAt(0));

    const stringifiedJson = this.#textDecoder.decode(decodedData);
    if (stringifiedJson) return JSON.parse(stringifiedJson);
    else return null;
  }

  /** Decodes a base64 body as text, for error messages that are not JSON. Returns the input when it is not base64. */
  #bodyAsText(body: string | null): string | null {
    if (body == null) return null;
    try {
      return this.#textDecoder.decode(Uint8Array.from(atob(body), (c) => c.charCodeAt(0)));
    } catch {
      return body;
    }
  }

  #getReplyKeyPair(): Promise<ReplyKeyPair> {
    this.#replyKeyPair ??= createReplyKeyPair();
    return this.#replyKeyPair;
  }

  connectToMachineServer(token: string, machineServerUrl: string, options?: { reconnect?: boolean }) {
    const reconnect = options?.reconnect ?? false;
    const state = this.wsState();

    if (state === 'disconnected' || state === 'error' || reconnect) {
      this.#ws?.close();
      this.#ws = null;
    }

    if (this.#ws) return;

    this.#hasHandledFirstCommandResponse = false;
    this.#ws = new WebSocket(machineServerUrl);
    this.#wsState.set('connecting');

    this.#ws.onopen = () => {
      this.#wsState.set('connect');
      this.#isConnectedToMachineServer.set(true);
      this.#isReconnecting.set(false);
      this.#reconnectToken.set(null);
      this.#reconnectUrl.set(null);
    };

    this.#ws.onclose = () => {
      // Should we reconnect automatically?
      this.#wsState.set('disconnected');
      this.#isConnectedToMachineServer.set(false);
      this.#reconnectToken.set(token);
      this.#reconnectUrl.set(machineServerUrl);
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
          this.#showInitialCommandError('Authentication failed');
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
          delete this.#pendingCommands[data.messageId];
          window.clearTimeout(f.timer);

          if (data.errorMessage) {
            this.#showInitialCommandError(data.errorMessage);
            f.reject(data.errorMessage);
          } else {
            this.#readResponse(data, f).then(
              (payload) => this.#completeCommand(payload, f),
              (err) => f.reject(err instanceof Error ? err.message : String(err))
            );
          }
        }
      }
    };
  }

  /** Reads the response payload, decrypting it when the request was encrypted. */
  async #readResponse(data: MessageEnvelope, f: PromiseResolver): Promise<CommandResponse> {
    // A response to an encrypted request is only accepted encrypted, whatever it claims to contain
    if (f.replyPrivateKey !== null)
      return decryptCommandResponse<CommandResponse>(data.payload, f.replyPrivateKey, data.messageId);

    return JSON.parse(data.payload ?? '') as CommandResponse;
  }

  #completeCommand(payload: CommandResponse, f: PromiseResolver) {
    if (payload.statusCode >= 400) {
      this.#showInitialCommandError(
        this.#bodyAsText(payload.body) || `Initial request failed with status code ${payload.statusCode}`
      );
    } else {
      this.#markInitialCommandHandled();
    }
    payload.body = payload?.body == null ? null : f.binaryBody ? payload.body : this.utf8Atob(payload.body);
    f.resolve(payload);
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
    target: RelayTarget,
    machineServerUrl: string,
    method: RequestMethod,
    path: string,
    requestBody: string | null,
    headers: { [key: string]: string } | null,
    timeout: number = 5000,
    binaryBody = false
  ) {
    if (this.wsState() === 'disconnected' || this.wsState() === 'error') {
      // Connect to the machine server if we are not connected
      this.connectToMachineServer(token, machineServerUrl);
    }

    return new Promise<CommandResponse>((resolve, reject) => {
      const messageId = randomUUID();

      const request: CommandRequest = {
        method,
        path,
        body: requestBody,
        headers,
      };

      const f: PromiseResolver = {
        resolve,
        reject,
        binaryBody,
        replyPrivateKey: null,
        timer: window.setTimeout(() => {
          const f = this.#pendingCommands[messageId];
          if (f) {
            delete this.#pendingCommands[messageId];
            this.#showInitialCommandError('The request timed out before receiving a response.');
            f.reject('Timeout');
          }
        }, timeout),
      };

      this.#pendingCommands[messageId] = f;

      this.#preparePayload(messageId, target, request, f).then(
        (payload) => {
          // The command may have timed out while the payload was prepared
          if (!this.#pendingCommands[messageId]) return;

          const message: MessageEnvelope = {
            from: ClientId,
            to: target.clientId,
            type: 'command',
            messageId: messageId,
            payload,
          };

          // If we are not yet connected to the machine server, queue the command
          if (this.#isConnectedToMachineServer()) this.activateCommand(message);
          else this.#queuedCommands.push(message);
        },
        (err) => {
          delete this.#pendingCommands[messageId];
          window.clearTimeout(f.timer);
          const message = err instanceof Error ? err.message : String(err);
          this.#showInitialCommandError(message);
          reject(message);
        }
      );
    });
  }

  /**
   * Serializes the request for the target: encrypted end-to-end for clients that require it, so the machine
   * server never sees the content, and plain text for older clients that only understand that.
   */
  async #preparePayload(
    messageId: string,
    target: RelayTarget,
    request: CommandRequest,
    f: PromiseResolver
  ): Promise<string> {
    if (!requiresEncryptedCommands(target)) return JSON.stringify(request);

    if (!target.publicKey) throw new Error('The client requires encrypted commands, but its public key is not known.');

    const replyKeyPair = await this.#getReplyKeyPair();
    const payload = await encryptCommandRequest(messageId, request, target.publicKey, replyKeyPair.publicJwk);
    f.replyPrivateKey = replyKeyPair.privateKey;
    return payload;
  }

  private activateCommand(message: MessageEnvelope) {
    this.#ws?.send(JSON.stringify(message));
  }
}
