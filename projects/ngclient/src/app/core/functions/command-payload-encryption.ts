import { compactDecrypt, CompactEncrypt, exportJWK, generateKeyPair, importSPKI, type JWK } from 'jose';

/**
 * End-to-end encryption of command payloads between this portal and a client (agent or runner), protocol
 * version 2. The machine server decrypts the transport layer to route messages, so the command payload is
 * encrypted separately, to a key the machine server does not hold, and it forwards the ciphertext unread.
 *
 * On the wire the payload is `{"v":2,"jwe":"<compact JWE>"}`. A request is encrypted to the client's public
 * key and its plaintext is `{"messageId":"...","replyKey":<JWK>,"request":<command request>}`, where the reply
 * key is an RSA public key this portal generated and keeps only in memory. The client encrypts
 * `{"messageId":"...","response":<command response>}` to the reply key with the same wrapper, so the portal's
 * key is never visible to the machine server either. The message id inside the ciphertext binds each payload
 * to its envelope: a relay cannot move a payload to another message, or replay an old response, unnoticed.
 *
 * This mirrors `CommandPayloadEncryption` in the Duplicati client; the two must stay in step.
 */

/** The wrapper version produced and accepted. */
export const COMMAND_PAYLOAD_VERSION = 2;

/** Clients that authenticated with this protocol version or later require encrypted command payloads. */
export const ENCRYPTED_COMMANDS_PROTOCOL_VERSION = 2;

/** The key management algorithm; the only one accepted, so a response cannot be downgraded. */
const KEY_ALGORITHM = 'RSA-OAEP-256';

/** The content encryption algorithm; the only one accepted. */
const CONTENT_ENCRYPTION = 'A256GCM';

/** The size of the reply key. */
const REPLY_KEY_BITS = 2048;

/** The wrapper placed in the envelope payload. */
export type EncryptedPayload = { v: number; jwe: string };

/**
 * Encodes text as bytes in this realm's Uint8Array. A TextEncoder from another realm (an iframe, or jsdom
 * in tests) returns a Uint8Array that fails jose's instanceof check.
 */
function toBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

/** The portal's reply key: the private half stays in memory, the public half travels inside the request. */
export type ReplyKeyPair = { privateKey: CryptoKey; publicJwk: JWK };

/** What the portal needs to know about a client to decide whether, and how, to encrypt for it. */
export type EncryptionTarget = { protocolVersion: number | null | undefined; publicKey: string | null | undefined };

/** Thrown when a payload does not meet the end-to-end encryption requirements. */
export class CommandPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandPayloadError';
  }
}

/** Generates a reply key pair. The private key is not extractable and never leaves the browser. */
export async function createReplyKeyPair(): Promise<ReplyKeyPair> {
  const pair = await generateKeyPair(KEY_ALGORITHM, { modulusLength: REPLY_KEY_BITS, extractable: false });
  const publicJwk = await exportJWK(pair.publicKey);
  return {
    privateKey: pair.privateKey as CryptoKey,
    publicJwk: { kty: publicJwk.kty, n: publicJwk.n, e: publicJwk.e },
  };
}

/** True when the client requires encrypted command payloads. Older clients only understand plain text. */
export function requiresEncryptedCommands(target: EncryptionTarget): boolean {
  return (target.protocolVersion ?? 0) >= ENCRYPTED_COMMANDS_PROTOCOL_VERSION;
}

/**
 * Encrypts a command request to a client's public key, including the reply key for the response.
 * @param messageId The envelope's message id, bound into the ciphertext
 * @param request The command request
 * @param clientPublicKeyPem The client's public key as a SubjectPublicKeyInfo PEM, as listed by the machine server
 * @param replyPublicJwk The public half of the reply key pair
 * @returns The payload string for the envelope
 */
export async function encryptCommandRequest(
  messageId: string,
  request: object,
  clientPublicKeyPem: string,
  replyPublicJwk: JWK
): Promise<string> {
  let clientKey: CryptoKey;
  try {
    clientKey = (await importSPKI(clientPublicKeyPem, KEY_ALGORITHM, { extractable: false })) as CryptoKey;
  } catch {
    throw new CommandPayloadError('The client public key could not be read');
  }

  const plaintext = toBytes(JSON.stringify({ messageId, replyKey: replyPublicJwk, request }));
  const jwe = await new CompactEncrypt(plaintext)
    .setProtectedHeader({ alg: KEY_ALGORITHM, enc: CONTENT_ENCRYPTION })
    .encrypt(clientKey);

  const wrapper: EncryptedPayload = { v: COMMAND_PAYLOAD_VERSION, jwe };
  return JSON.stringify(wrapper);
}

/** Parses the wrapper, accepting only the supported version. Returns null for anything else, including plain text. */
export function parseEncryptedPayload(payload: string | null | undefined): EncryptedPayload | null {
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const candidate = parsed as Partial<EncryptedPayload>;
  if (candidate.v !== COMMAND_PAYLOAD_VERSION || typeof candidate.jwe !== 'string' || candidate.jwe.length === 0)
    return null;

  return { v: candidate.v, jwe: candidate.jwe };
}

/** True when the payload carries the encrypted wrapper, without decrypting it. */
export function isEncryptedPayload(payload: string | null | undefined): boolean {
  return parseEncryptedPayload(payload) !== null;
}

/**
 * Decrypts a command response with the reply key.
 * @param payload The envelope payload
 * @param replyPrivateKey The private half of the reply key pair
 * @param expectedMessageId The envelope's message id; the response must be bound to the same id
 * @returns The parsed response
 * @throws CommandPayloadError when the payload is not encrypted, cannot be decrypted, is malformed, or belongs to another message
 */
export async function decryptCommandResponse<T>(
  payload: string | null | undefined,
  replyPrivateKey: CryptoKey,
  expectedMessageId: string
): Promise<T> {
  const wrapper = parseEncryptedPayload(payload);
  if (wrapper === null) throw new CommandPayloadError('The response is not end-to-end encrypted');

  let plaintext: Uint8Array;
  try {
    const result = await compactDecrypt(wrapper.jwe, replyPrivateKey, {
      keyManagementAlgorithms: [KEY_ALGORITHM],
      contentEncryptionAlgorithms: [CONTENT_ENCRYPTION],
    });
    plaintext = result.plaintext;
  } catch {
    throw new CommandPayloadError('The response could not be decrypted');
  }

  let decoded: { messageId?: unknown; response?: unknown };
  try {
    decoded = JSON.parse(new TextDecoder().decode(plaintext));
  } catch {
    throw new CommandPayloadError('The decrypted response is malformed');
  }

  if (typeof decoded !== 'object' || decoded === null || decoded.response === undefined)
    throw new CommandPayloadError('The decrypted response is malformed');

  if (decoded.messageId !== expectedMessageId) throw new CommandPayloadError('The response belongs to another message');

  return decoded.response as T;
}
