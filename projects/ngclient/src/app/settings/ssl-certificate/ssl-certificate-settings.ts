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

/** The certificate and its password travel unencrypted unless the page itself was loaded over HTTPS */
export const isInsecureConnection = (protocol: string) => protocol.toLowerCase() !== 'https:';

/** The server refuses a PFX file without a password, so the upload needs both */
export const canUploadCertificate = (files: File[], password: string) => files.length > 0 && password.trim() !== '';
