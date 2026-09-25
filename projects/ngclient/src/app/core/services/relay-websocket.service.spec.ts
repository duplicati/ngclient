import { TestBed } from '@angular/core/testing';
import { compactDecrypt, CompactEncrypt, exportSPKI, generateKeyPair, importJWK, type JWK } from 'jose';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { ConnectingScreenService } from './connecting-screen.service';
import { RelayWebsocketService, type RelayTarget } from './relay-websocket.service';

class RelaySocket {
  static OPEN = 1;
  static instances: RelaySocket[] = [];
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  send = vi.fn<(data: string) => void>();
  close = vi.fn();

  constructor(readonly url: string) {
    RelaySocket.instances.push(this);
  }

  open() {
    this.readyState = RelaySocket.OPEN;
    this.onopen?.();
  }

  receive(data: object) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }

  sent() {
    return this.send.mock.calls.map(([data]) => JSON.parse(data));
  }
}

/** The machine server's side of the handshake. */
function completeHandshake(socket: RelaySocket) {
  socket.receive({ from: 'server', to: 'unknown', type: 'welcome', messageId: 'w-1', payload: '{}' });
  const auth = socket.sent().at(-1);
  expect(auth.type).toBe('authportal');
  socket.receive({
    from: 'server',
    to: auth.from,
    type: 'authportal',
    messageId: auth.messageId,
    payload: JSON.stringify({ accepted: true, willReplaceToken: false, newToken: null }),
  });
}

function toBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

/** Waits for pending promise chains (key generation, encryption) without fake timers. */
async function settle() {
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setTimeout(resolve, 5));
}

describe('RelayWebsocketService', () => {
  let service: RelayWebsocketService;
  let showError: ReturnType<typeof vi.fn>;
  let agentPrivateKey: CryptoKey;
  let agentTarget: RelayTarget;
  const legacyTarget: RelayTarget = { clientId: 'agent-v1', publicKey: null, protocolVersion: 1 };

  beforeAll(async () => {
    const pair = await generateKeyPair('RSA-OAEP-256', { modulusLength: 2048, extractable: true });
    agentPrivateKey = pair.privateKey as CryptoKey;
    agentTarget = { clientId: 'agent-v2', publicKey: await exportSPKI(pair.publicKey), protocolVersion: 2 };
  });

  beforeEach(() => {
    RelaySocket.instances = [];
    vi.stubGlobal('WebSocket', RelaySocket);
    showError = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        RelayWebsocketService,
        { provide: ENVIRONMENT_TOKEN, useValue: {} },
        { provide: ConnectingScreenService, useValue: { showError } },
      ],
    });
    service = TestBed.inject(RelayWebsocketService);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  const send = (target: RelayTarget, path = '/api/v1/systeminfo') =>
    service.sendCommand('token', target, 'wss://relay.example/portal', 'GET', path, null, null, 5000, false);

  /** What the agent does: decrypt the request, read the reply key, answer encrypted to it under the same message id. */
  async function agentAnswer(command: any, response: object, messageId = command.messageId) {
    const wrapper = JSON.parse(command.payload);
    const { plaintext } = await compactDecrypt(wrapper.jwe, agentPrivateKey);
    const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as {
      messageId: string;
      replyKey: JWK;
      request: any;
    };
    const replyKey = await importJWK(decoded.replyKey, 'RSA-OAEP-256');
    const jwe = await new CompactEncrypt(toBytes(JSON.stringify({ messageId, response })))
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(replyKey);
    return {
      decoded,
      envelope: {
        from: command.to,
        to: command.from,
        type: 'command',
        messageId: command.messageId,
        payload: JSON.stringify({ v: 2, jwe }),
      },
    };
  }

  it('queues a command prepared while the socket is open but not yet authenticated, and sends it after authportal', async () => {
    const pending = send(agentTarget);
    const socket = RelaySocket.instances[0];
    socket.open();
    // Key generation and encryption finish while the handshake is still in flight
    await settle();
    expect(socket.sent()).toEqual([]);

    completeHandshake(socket);
    const sent = socket.sent();
    expect(sent.map((m: any) => m.type)).toEqual(['authportal', 'command']);
    expect(sent[1].to).toBe('agent-v2');
    expect(JSON.parse(sent[1].payload).v).toBe(2);

    const { decoded, envelope } = await agentAnswer(sent[1], {
      statusCode: 200,
      body: btoa('{"ok":true}'),
      headers: null,
    });
    expect(decoded.messageId).toBe(sent[1].messageId);
    expect(decoded.request).toEqual({ method: 'GET', path: '/api/v1/systeminfo', body: null, headers: null });
    socket.receive(envelope);
    await expect(pending).resolves.toEqual({ statusCode: 200, body: { ok: true }, headers: null });
    expect(showError).not.toHaveBeenCalled();
  });

  it('sends plain text to a client on protocol version 1', async () => {
    send(legacyTarget);
    const socket = RelaySocket.instances[0];
    socket.open();
    completeHandshake(socket);
    await settle();

    const command = socket.sent().at(-1);
    expect(command.type).toBe('command');
    expect(JSON.parse(command.payload)).toEqual({
      method: 'GET',
      path: '/api/v1/systeminfo',
      body: null,
      headers: null,
    });
  });

  it('rejects, and shows, a response that is not bound to the request', async () => {
    const pending = send(agentTarget);
    const socket = RelaySocket.instances[0];
    socket.open();
    completeHandshake(socket);
    await settle();
    const command = socket.sent().at(-1);

    const { envelope } = await agentAnswer(command, { statusCode: 200, body: null, headers: null }, 'another-message');
    socket.receive(envelope);

    await expect(pending).rejects.toBe('The response belongs to another message');
    expect(showError).toHaveBeenCalledWith('The response belongs to another message');
  });

  it('rejects, and shows, a plain text response to an encrypted request', async () => {
    const pending = send(agentTarget);
    const socket = RelaySocket.instances[0];
    socket.open();
    completeHandshake(socket);
    await settle();
    const command = socket.sent().at(-1);

    socket.receive({
      from: 'agent-v2',
      to: command.from,
      type: 'command',
      messageId: command.messageId,
      payload: JSON.stringify({ statusCode: 200, body: null, headers: null }),
    });

    await expect(pending).rejects.toBe('The response is not end-to-end encrypted');
    expect(showError).toHaveBeenCalledWith('The response is not end-to-end encrypted');
  });

  it('ignores list updates pushed by the machine server', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    send(legacyTarget);
    const socket = RelaySocket.instances[0];
    socket.open();
    completeHandshake(socket);
    socket.receive({ from: 'server', to: 'x', type: 'list', messageId: 'l-1', payload: '[]' });
    socket.receive({ from: 'server', to: 'x', type: 'listrunners', messageId: 'l-2', payload: '[]' });
    expect(warn).not.toHaveBeenCalled();
  });
});
