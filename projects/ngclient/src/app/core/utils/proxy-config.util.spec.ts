import { HttpHeaders } from '@angular/common/http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { client as apiClient } from '../openapi/client.gen';
import {
  configureProxySupport,
  getApiBase,
  getApiConfigHeaders,
  getXsrfHeaders,
  getXsrfQueryParam,
} from './proxy-config.util';

const client = { getConfig: vi.fn(), setConfig: vi.fn() };

describe('proxy configuration utilities', () => {
  let originalUrl: string;
  let originalState: unknown;
  let tags: HTMLMetaElement[];

  beforeEach(() => {
    originalUrl = window.location.href;
    originalState = window.history.state;
    tags = [];
    client.getConfig.mockReset().mockReturnValue({});
    client.setConfig.mockReset();
    vi.spyOn(apiClient, 'getConfig').mockImplementation(client.getConfig);
    vi.spyOn(apiClient, 'setConfig').mockImplementation(client.setConfig);
    window.history.replaceState(null, '', window.location.pathname);
  });

  afterEach(() => {
    tags.forEach((tag) => tag.remove());
    window.history.replaceState(originalState, '', originalUrl);
    vi.restoreAllMocks();
    client.getConfig.mockReset();
    client.setConfig.mockReset();
  });

  const meta = (name: string, attributes: Record<string, string | undefined> = {}) => {
    const tag = document.createElement('meta');
    tag.name = name;
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== undefined) tag.setAttribute(key, value);
    });
    document.head.appendChild(tag);
    tags.push(tag);
    return tag;
  };

  const query = (search: string) => window.history.replaceState(null, '', `${window.location.pathname}${search}`);

  it.each([
    { content: '/duplicati', expected: '/duplicati' },
    { content: '/duplicati/', expected: '/duplicati' },
    { content: '  /some/prefix/  ', expected: '/some/prefix' },
  ])('sets the normalized proxy prefix for $content', ({ content, expected }) => {
    meta('duplicati-proxy-config', { content });
    configureProxySupport();
    expect(client.setConfig).toHaveBeenCalledExactlyOnceWith({ baseUrl: expected });
  });

  it.each([
    { name: 'missing tag', attributes: null },
    { name: 'missing content', attributes: {} },
    { name: 'empty content', attributes: { content: '' } },
    { name: 'whitespace', attributes: { content: '  ' } },
    { name: 'relative prefix', attributes: { content: 'duplicati' } },
    { name: 'absolute URL', attributes: { content: 'https://example.test/duplicati' } },
  ])('sets an empty base URL for $name', ({ attributes }) => {
    if (attributes) meta('duplicati-proxy-config', attributes);
    configureProxySupport();
    expect(client.setConfig).toHaveBeenCalledExactlyOnceWith({ baseUrl: '' });
  });

  it('requests an empty base URL when the proxy tag is removed before reconfiguration', () => {
    const tag = meta('duplicati-proxy-config', { content: '/duplicati' });
    configureProxySupport();
    tag.remove();
    configureProxySupport();
    expect(client.setConfig.mock.calls).toEqual([[{ baseUrl: '/duplicati' }], [{ baseUrl: '' }]]);
  });

  it.each([
    { search: '?token=plain-token', value: 'plain-token', encoded: 'plain-token' },
    { search: '?token=hello+world', value: 'hello world', encoded: 'hello%20world' },
    { search: '?token=%E6%97%A5%E6%9C%AC%E8%AA%9E', value: '日本語', encoded: '%E6%97%A5%E6%9C%AC%E8%AA%9E' },
    { search: '?other=ignored&token=a%2Bb%26c', value: 'a+b&c', encoded: 'a%2Bb%26c' },
  ])('decodes XSRF headers and encodes query values for $search', ({ search, value, encoded }) => {
    meta('duplicati-xsrf-config', { 'data-header-name': ' X-Test-XSRF ', 'data-query-name': ' token ' });
    query(search);
    expect(getXsrfHeaders()).toEqual({ 'X-Test-XSRF': value });
    expect(getXsrfQueryParam()).toBe(`token=${encoded}`);
  });

  it.each([
    { name: 'missing tag', attributes: null, search: '?token=value' },
    { name: 'missing header name', attributes: { 'data-query-name': 'token' }, search: '?token=value' },
    {
      name: 'empty header name',
      attributes: { 'data-header-name': ' ', 'data-query-name': 'token' },
      search: '?token=value',
    },
    { name: 'missing query name', attributes: { 'data-header-name': 'X-Test-XSRF' }, search: '?token=value' },
    {
      name: 'empty query name',
      attributes: { 'data-header-name': 'X-Test-XSRF', 'data-query-name': '' },
      search: '?token=value',
    },
    {
      name: 'missing query value',
      attributes: { 'data-header-name': 'X-Test-XSRF', 'data-query-name': 'token' },
      search: '?other=value',
    },
    {
      name: 'empty query value',
      attributes: { 'data-header-name': 'X-Test-XSRF', 'data-query-name': 'token' },
      search: '?token=',
    },
  ])('omits XSRF configuration for $name', ({ attributes, search }) => {
    if (attributes) meta('duplicati-xsrf-config', attributes);
    query(search);
    expect(getXsrfHeaders()).toEqual({});
    expect(getXsrfQueryParam()).toBeNull();
    configureProxySupport();
    expect(client.setConfig).toHaveBeenCalledExactlyOnceWith({ baseUrl: '' });
  });

  it('passes both proxy and decoded XSRF configuration to the client', () => {
    meta('duplicati-proxy-config', { content: '/duplicati/' });
    meta('duplicati-xsrf-config', { 'data-header-name': 'X-Test-XSRF', 'data-query-name': 'token' });
    query('?token=a%2Bb');
    configureProxySupport();
    expect(client.setConfig).toHaveBeenCalledTimes(2);
    expect(client.setConfig).toHaveBeenCalledWith({ baseUrl: '/duplicati' });
    expect(client.setConfig).toHaveBeenCalledWith({ headers: { 'X-Test-XSRF': 'a+b' } });
  });

  it.each([
    { config: { baseUrl: '/duplicati' }, expected: '/duplicati' },
    { config: { baseUrl: '' }, expected: '' },
    { config: {}, expected: '' },
  ])('reads the API base from $config', ({ config, expected }) => {
    client.getConfig.mockReturnValue(config);
    expect(getApiBase()).toBe(expected);
  });

  it('returns configured plain-record headers', () => {
    client.getConfig.mockReturnValue({ headers: { 'X-Test-XSRF': 'value', 'X-Other': 'other' } });
    expect(getApiConfigHeaders()).toEqual({ 'X-Test-XSRF': 'value', 'X-Other': 'other' });
  });

  it('returns no headers when they are unspecified', () => {
    expect(getApiConfigHeaders()).toEqual({});
  });

  it('returns no headers for an Angular HttpHeaders instance', () => {
    client.getConfig.mockReturnValue({ headers: new HttpHeaders({ 'X-Test-XSRF': 'value' }) });
    expect(getApiConfigHeaders()).toEqual({});
  });
});
