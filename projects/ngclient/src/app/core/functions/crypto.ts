export function randomUUID() {
  if (window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }

  return generateUUIDv4Fallback();
}

export function getRandomValues() {
  if (window.crypto && window.crypto.getRandomValues) {
    const result = new Uint8Array(1);
    window.crypto.getRandomValues(result);
    return result[0];
  } else if ((window as any).msCrypto && (window as any).msCrypto.getRandomValues) {
    const result = new Uint8Array(1);
    (window as any).msCrypto.getRandomValues(result);
    return result[0];
  } else {
    return Math.floor(Math.random() * 256);
  }
}

function generateUUIDv4Fallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
