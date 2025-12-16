import { OpenAPI } from '../openapi/core/OpenAPI';

/**
 * Reads proxy configuration from meta tags in the HTML.
 *
 * Expected format:
 *   <meta name="duplicati-proxy-config" content="{prefix}" />
 *
 * Where {prefix} is the proxy prefix, e.g. "/duplicati" or "/some/prefix".
 * If the content is empty or does not start with "/", no proxy prefix is applied.
 */
export function getProxyConfigFromMetaTag(): string | null {
  try {
    const metaTag = document.querySelector('meta[name="duplicati-proxy-config"]');

    if (metaTag) {
      const raw = (metaTag.getAttribute('content') || '').trim();

      // Only treat it as a proxy prefix if it starts with "/"
      if (raw && raw.startsWith('/')) {
        return raw;
      }
    }
  } catch (error) {
    console.warn('Failed to read proxy configuration from meta tag:', error);
  }

  // Default configuration - no proxy
  return null;
}

/**
 * Reads disable frame buster configuration from meta tags in the HTML.
 *
 * Expected format:
 *   <meta name="duplicati-relay-support-disabled" content="true" />
 *
 * If the content is not "true", the relay support is enabled.
 */
export function isRelaySupportEnabled(): boolean {
  try {
    const metaTag = document.querySelector('meta[name="duplicati-enable-iframe-hosting"]');

    if (metaTag) {
      const raw = (metaTag.getAttribute('content') || '').trim();

      if (raw && raw.length > 0) {
        return raw.toLowerCase() !== 'true';
      }
    }
  } catch (error) {
    console.warn('Failed to read disable relay support configuration from meta tag:', error);
  }

  // Default keep relay support enabled
  return true;
}

/**
 * Configures OpenAPI to use the proxy path from meta tag configuration.
 * This is safe to call multiple times; it simply overwrites OpenAPI.BASE.
 */
export function configureOpenApiProxyPath(): void {
  const prefix = getProxyConfigFromMetaTag();

  if (prefix && prefix.length > 0) {
    // Normalize: ensure it starts with '/' and does not end with '/'
    let normalizedPath = prefix;
    if (!normalizedPath.startsWith('/')) {
      normalizedPath = `/${normalizedPath}`;
    }
    if (normalizedPath.endsWith('/')) {
      normalizedPath = normalizedPath.slice(0, -1);
    }

    OpenAPI.BASE = normalizedPath;
  } else {
    OpenAPI.BASE = '';
  }
}
