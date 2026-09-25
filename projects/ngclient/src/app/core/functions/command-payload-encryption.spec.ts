import { compactDecrypt, CompactEncrypt, exportSPKI, generateKeyPair, importJWK, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CommandPayloadError,
  createReplyKeyPair,
  decryptCommandResponse,
  encryptCommandRequest,
  isEncryptedPayload,
  parseEncryptedPayload,
  requiresEncryptedCommands,
  type ReplyKeyPair,
} from './command-payload-encryption';

/**
 * The client side is simulated here with the same primitives, following the format pinned by the Duplicati
 * client's own tests: RSA-OAEP-256 + A256GCM, wrapper `{"v":2,"jwe":...}`, request plaintext
 * `{"replyKey":<JWK>,"request":...}`.
 */
/** jsdom's TextEncoder returns a Uint8Array from another realm, which jose rejects; normalize like the helper does. */
function toBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

describe('command payload encryption', () => {
  let clientPrivateKey: CryptoKey;
  let clientPublicKeyPem: string;
  let replyKeyPair: ReplyKeyPair;

  const MESSAGE_ID = '428411b1-e8a0-4e5b-91b2-52cdd3b10fc3';

  const request = {
    method: 'GET',
    path: '/api/v1/backups?filter=patient',
    body: null,
    headers: { Accept: 'application/json' },
  };

  /** What the client does: decrypt the request, read the reply key, encrypt the response to it. */
  async function clientRoundTrip(payload: string, response: object, respondUnderMessageId?: string) {
    const wrapper = parseEncryptedPayload(payload)!;
    const { plaintext, protectedHeader } = await compactDecrypt(wrapper.jwe, clientPrivateKey);
    const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as {
      messageId: string;
      replyKey: JWK;
      request: unknown;
    };
    const replyKey = await importJWK(decoded.replyKey, 'RSA-OAEP-256');
    const jwe = await new CompactEncrypt(
      toBytes(JSON.stringify({ messageId: respondUnderMessageId ?? decoded.messageId, response }))
    )
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(replyKey);
    return { protectedHeader, decoded, responsePayload: JSON.stringify({ v: 2, jwe }) };
  }

  beforeAll(async () => {
    const pair = await generateKeyPair('RSA-OAEP-256', { modulusLength: 2048, extractable: true });
    clientPrivateKey = pair.privateKey as CryptoKey;
    clientPublicKeyPem = await exportSPKI(pair.publicKey);
    replyKeyPair = await createReplyKeyPair();
  });

  it('only clients on protocol version 2 or later require encryption', () => {
    expect(requiresEncryptedCommands({ protocolVersion: 1, publicKey: 'key' })).toBe(false);
    expect(requiresEncryptedCommands({ protocolVersion: null, publicKey: 'key' })).toBe(false);
    expect(requiresEncryptedCommands({ protocolVersion: undefined, publicKey: null })).toBe(false);
    expect(requiresEncryptedCommands({ protocolVersion: 2, publicKey: 'key' })).toBe(true);
    expect(requiresEncryptedCommands({ protocolVersion: 3, publicKey: 'key' })).toBe(true);
  });

  it('produces the versioned wrapper with the pinned algorithms and the reply key inside', async () => {
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);

    const wrapper = parseEncryptedPayload(payload);
    expect(wrapper).not.toBeNull();
    expect(wrapper!.v).toBe(2);
    expect(wrapper!.jwe.split('.')).toHaveLength(5);
    expect(isEncryptedPayload(payload)).toBe(true);

    const { protectedHeader, decoded } = await clientRoundTrip(payload, {});
    expect(protectedHeader).toEqual({ alg: 'RSA-OAEP-256', enc: 'A256GCM' });
    expect(decoded.request).toEqual(request);
    expect(decoded.messageId).toBe(MESSAGE_ID);
    expect(decoded.replyKey).toEqual({ kty: 'RSA', n: replyKeyPair.publicJwk.n, e: replyKeyPair.publicJwk.e });
  });

  it('decrypts the response the client encrypted to the reply key', async () => {
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);
    const response = { statusCode: 200, body: 'AQID', headers: { 'Content-Type': 'application/json' } };

    const { responsePayload } = await clientRoundTrip(payload, response);

    await expect(decryptCommandResponse(responsePayload, replyKeyPair.privateKey, MESSAGE_ID)).resolves.toEqual(
      response
    );
  });

  it('refuses a response that is not encrypted, or encrypted to another key', async () => {
    await expect(
      decryptCommandResponse('{"statusCode":200,"body":null,"headers":null}', replyKeyPair.privateKey, MESSAGE_ID)
    ).rejects.toBeInstanceOf(CommandPayloadError);
    await expect(decryptCommandResponse(null, replyKeyPair.privateKey, MESSAGE_ID)).rejects.toBeInstanceOf(
      CommandPayloadError
    );

    const otherPair = await createReplyKeyPair();
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, otherPair.publicJwk);
    const { responsePayload } = await clientRoundTrip(payload, { statusCode: 200 });
    await expect(decryptCommandResponse(responsePayload, replyKeyPair.privateKey, MESSAGE_ID)).rejects.toBeInstanceOf(
      CommandPayloadError
    );
  });

  it('refuses a response bound to another message, or to none', async () => {
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);

    const swapped = await clientRoundTrip(payload, { statusCode: 200 }, 'some-other-message-id');
    await expect(
      decryptCommandResponse(swapped.responsePayload, replyKeyPair.privateKey, MESSAGE_ID)
    ).rejects.toBeInstanceOf(CommandPayloadError);

    const replyKey = await importJWK(replyKeyPair.publicJwk, 'RSA-OAEP-256');
    const unbound = await new CompactEncrypt(toBytes('{"statusCode":200}'))
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(replyKey);
    await expect(
      decryptCommandResponse(JSON.stringify({ v: 2, jwe: unbound }), replyKeyPair.privateKey, MESSAGE_ID)
    ).rejects.toBeInstanceOf(CommandPayloadError);
  });

  it('refuses a response with another content encryption algorithm', async () => {
    const replyKey = await importJWK(replyKeyPair.publicJwk, 'RSA-OAEP-256');
    const jwe = await new CompactEncrypt(
      toBytes(JSON.stringify({ messageId: MESSAGE_ID, response: { statusCode: 200 } }))
    )
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256CBC-HS512' })
      .encrypt(replyKey);

    await expect(
      decryptCommandResponse(JSON.stringify({ v: 2, jwe }), replyKeyPair.privateKey, MESSAGE_ID)
    ).rejects.toBeInstanceOf(CommandPayloadError);
  });

  it('does not treat plain text or other wrappers as encrypted', () => {
    for (const payload of [
      null,
      undefined,
      '',
      'not json',
      '[]',
      '{"method":"GET"}',
      '{"v":1,"jwe":"a.b.c.d.e"}',
      '{"v":"2","jwe":"a.b.c.d.e"}',
      '{"v":2}',
      '{"v":2,"jwe":""}',
    ]) {
      expect(isEncryptedPayload(payload)).toBe(false);
    }
  });

  it('rejects a client key that is not a SubjectPublicKeyInfo PEM', async () => {
    await expect(
      encryptCommandRequest(
        MESSAGE_ID,
        request,
        '-----BEGIN RSA PUBLIC KEY-----\nMIIB\n-----END RSA PUBLIC KEY-----',
        replyKeyPair.publicJwk
      )
    ).rejects.toBeInstanceOf(CommandPayloadError);
  });
});
