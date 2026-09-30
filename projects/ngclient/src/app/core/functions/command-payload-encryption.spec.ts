import { compactDecrypt, CompactEncrypt, exportSPKI, generateKeyPair, importJWK, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CommandPayloadError,
  COMPRESSION_THRESHOLD_BYTES,
  createReplyKeyPair,
  decryptCommandResponse,
  encryptCommandRequest,
  isEncryptedPayload,
  parseEncryptedPayload,
  requiresEncryptedCommands,
  type ReplyKeyPair,
} from './command-payload-encryption';

/** jsdom's TextEncoder returns a Uint8Array from another realm, which jose rejects; normalize like the helper does. */
function toBytes(text: string): Uint8Array {
  return new Uint8Array(new TextEncoder().encode(text));
}

/** What the client does for large plaintexts. */
async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  }).pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** What the client does for compressed requests. */
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(new Uint8Array(bytes));
      controller.close();
    },
  }).pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The client side is simulated here with the same primitives, following the format pinned by the Duplicati
 * client's own tests: RSA-OAEP-256 + A256GCM, wrapper `{"v":2,"jwe":...}` with optional `"zip":"gzip"`, request
 * plaintext `{"messageId":...,"replyKey":<JWK>,"request":...}`, response plaintext `{"messageId":...,"response":...}`.
 */
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

  /** What the client does: decrypt the request, read the reply key, answer encrypted to it under the same message id. */
  async function clientRoundTrip(
    payload: string,
    response: object,
    respondUnderMessageId?: string,
    options?: { compress?: boolean; zip?: string }
  ) {
    const wrapper = parseEncryptedPayload(payload)!;
    let { plaintext } = await compactDecrypt(wrapper.jwe, clientPrivateKey);
    const { protectedHeader } = await compactDecrypt(wrapper.jwe, clientPrivateKey);
    if (wrapper.zip === 'gzip') plaintext = await gunzip(plaintext);
    const decoded = JSON.parse(new TextDecoder().decode(plaintext)) as {
      messageId: string;
      replyKey: JWK;
      request: unknown;
    };
    const replyKey = await importJWK(decoded.replyKey, 'RSA-OAEP-256');
    let responsePlaintext = toBytes(
      JSON.stringify({ messageId: respondUnderMessageId ?? decoded.messageId, response })
    );
    if (options?.compress) responsePlaintext = await gzip(responsePlaintext);
    const jwe = await new CompactEncrypt(responsePlaintext)
      .setProtectedHeader({ alg: 'RSA-OAEP-256', enc: 'A256GCM' })
      .encrypt(replyKey);
    const zip = options?.zip ?? (options?.compress ? 'gzip' : undefined);
    return { protectedHeader, decoded, responsePayload: JSON.stringify(zip ? { v: 2, jwe, zip } : { v: 2, jwe }) };
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
    expect(wrapper!.zip).toBeUndefined();
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

  it('compresses a large request, such as a restore with many paths, and leaves small ones plain', async () => {
    const paths = Array.from(
      { length: 500 },
      (_, i) => `/home/user/documents/project-${i}/report-final-v${i % 7}.docx`
    );
    const restore = {
      method: 'POST',
      path: '/api/v1/backup/1/restore',
      body: btoa(JSON.stringify({ paths })),
      headers: null,
    };

    const payload = await encryptCommandRequest(MESSAGE_ID, restore, clientPublicKeyPem, replyKeyPair.publicJwk);
    const wrapper = parseEncryptedPayload(payload)!;
    expect(wrapper.zip).toBe('gzip');
    expect(payload.length).toBeLessThan(JSON.stringify(restore).length / 2);

    const { decoded } = await clientRoundTrip(payload, {});
    expect(decoded.request).toEqual(restore);
    expect(decoded.messageId).toBe(MESSAGE_ID);

    // The small request stays plain, so the threshold is what decides
    const small = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);
    expect(parseEncryptedPayload(small)!.zip).toBeUndefined();
    expect(JSON.stringify({ messageId: MESSAGE_ID, replyKey: replyKeyPair.publicJwk, request }).length).toBeLessThan(
      COMPRESSION_THRESHOLD_BYTES
    );
  });

  it('decrypts a gzip compressed response, and one that is not compressed, alike', async () => {
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);
    const items = Array.from({ length: 2000 }, (_, i) => `{"name":"option-${i}","description":"repeats a lot"}`);
    const body = btoa(`[${items.join(',')}]`);
    const response = { statusCode: 200, body, headers: { 'Content-Type': 'application/json' } };

    const compressed = await clientRoundTrip(payload, response, undefined, { compress: true });
    expect(parseEncryptedPayload(compressed.responsePayload)!.zip).toBe('gzip');
    expect(compressed.responsePayload.length).toBeLessThan(body.length / 4);
    await expect(
      decryptCommandResponse(compressed.responsePayload, replyKeyPair.privateKey, MESSAGE_ID)
    ).resolves.toEqual(response);

    const plain = await clientRoundTrip(payload, response);
    expect(parseEncryptedPayload(plain.responsePayload)!.zip).toBeUndefined();
    await expect(decryptCommandResponse(plain.responsePayload, replyKeyPair.privateKey, MESSAGE_ID)).resolves.toEqual(
      response
    );
  });

  it('refuses unsupported or corrupt compression', async () => {
    const payload = await encryptCommandRequest(MESSAGE_ID, request, clientPublicKeyPem, replyKeyPair.publicJwk);

    const unsupported = await clientRoundTrip(payload, { statusCode: 200 }, undefined, { zip: 'br' });
    await expect(
      decryptCommandResponse(unsupported.responsePayload, replyKeyPair.privateKey, MESSAGE_ID)
    ).rejects.toThrow('unsupported compression');

    // Says gzip, but the plaintext was never compressed
    const corrupt = await clientRoundTrip(payload, { statusCode: 200 }, undefined, { zip: 'gzip' });
    await expect(decryptCommandResponse(corrupt.responsePayload, replyKeyPair.privateKey, MESSAGE_ID)).rejects.toThrow(
      'could not be decompressed'
    );

    expect(isEncryptedPayload('{"v":2,"jwe":"a.b.c.d.e","zip":7}')).toBe(false);
    expect(isEncryptedPayload('{"v":2,"jwe":"a.b.c.d.e","zip":"gzip"}')).toBe(true);
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
