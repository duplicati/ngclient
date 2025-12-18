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
function getProxyConfigFromMetaTag(): string | null {
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
 * Reads XSRF configuration from meta tags in the HTML.
 *
 * Expected format:
 *   <meta name="duplicati-xsrf-config" data-header-name="{headerName}" data-query-name="{queryName}" />
 *
 * Where {headerName} is the name of the header to send, and {queryName} is the name of the query parameter to read.
 * If the header name or query name is empty, no XSRF is applied.
 */
function getXsrfConfigFromMetaTag(): { headerName: string; queryName: string; headerValue: string } | null {
  try {
    const metaConfig = document.querySelector('meta[name="duplicati-xsrf-config"]');

    if (metaConfig) {
      const headerName = (metaConfig.getAttribute('data-header-name') || '').trim();
      const queryName = (metaConfig.getAttribute('data-query-name') || '').trim();

      if (headerName && queryName && headerName.length > 0 && queryName.length > 0) {
        const urlParams = new URLSearchParams(window.location.search);
        const headerValue = urlParams.get(queryName);

        if (headerValue) {
          return { headerName, queryName, headerValue };
        }
      }
    }
  } catch (error) {
    console.warn('Failed to read XSRF configuration from meta tags:', error);
  }

  return null;
}

/**
 * Returns the XSRF query parameter from the URL, if present.
 */
export function getXsrfQueryParam(): string | null {
  const config = getXsrfConfigFromMetaTag();

  if (config) return `${config.queryName}=${encodeURIComponent(config.headerValue)}`;
  return null;
}

/**
 * Returns the XSRF header to send, if present.
 */
export function getXsrfHeaders(): { [header: string]: string } {
  const config = getXsrfConfigFromMetaTag();

  if (config) return { [config.headerName]: config.headerValue };
  return {};
}

/**
 * Configures OpenAPI to use the proxy path from meta tag configuration.
 * This is safe to call multiple times; it simply overwrites OpenAPI.BASE.
 */
export function configureProxySupport(): void {
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

  const headerConfig = getXsrfConfigFromMetaTag();
  if (headerConfig) {
    OpenAPI.HEADERS = {
      [headerConfig.headerName]: headerConfig.headerValue,
    };
  }
}
