import { UpdateCertificateInputDto } from '../../core/openapi';

/** Encodes the bytes of a certificate file as base64, the format the server expects */
export const toBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

/** Builds the request that installs a PFX (PKCS #12) certificate as the server's HTTPS certificate */
export const toUpdateCertificateRequest = (pfx: ArrayBuffer, password: string): UpdateCertificateInputDto => ({
  Certificate: toBase64(pfx),
  Password: password,
});

/** Hosts that are the machine itself, where the traffic never reaches a network */
const LOOPBACK_HOSTNAMES = ['localhost', '127.0.0.1'];

/**
 * The certificate and its password travel unencrypted unless the page itself was loaded over HTTPS.
 * A page loaded from the machine itself is not at risk, as the traffic never leaves it.
 */
export const isInsecureConnection = ({ protocol, hostname }: Pick<Location, 'protocol' | 'hostname'>) =>
  protocol.toLowerCase() !== 'https:' && !LOOPBACK_HOSTNAMES.includes(hostname.toLowerCase());

/** The server refuses a PFX file without a password, so the upload needs both */
export const canUploadCertificate = (files: File[], password: string) => files.length > 0 && password.trim() !== '';
