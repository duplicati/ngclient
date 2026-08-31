import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { firstValueFrom, Observable, of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { client } from '../openapi/client.gen';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState, dummytoken } from '../states/app-auth.state';
import { httpInterceptor } from './http.interceptor';

describe('httpInterceptor', () => {
  const apiRoot = '/proxy/api';
  let currentToken: string | null;
  let auth: {
    token: ReturnType<typeof vi.fn>;
    refreshToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
  let router: { navigate: ReturnType<typeof vi.fn> };
  let localStorage: { getItem: ReturnType<typeof vi.fn> };
  let alerts: { error: ReturnType<typeof vi.fn> };

  const runInterceptor = (request: HttpRequest<unknown>, next: HttpHandlerFn) =>
    TestBed.runInInjectionContext(() => httpInterceptor(request, next));

  const httpError = (status: number, message = 'request failed') =>
    new HttpErrorResponse({
      error: { Error: message },
      status,
      statusText: message,
      url: `${apiRoot}/v1/test`,
    });

  beforeEach(() => {
    currentToken = 'initial-token';
    auth = {
      token: vi.fn(() => currentToken),
      refreshToken: vi.fn(() => {
        currentToken = 'refreshed-token';
        return of({ AccessToken: currentToken });
      }),
      logout: vi.fn(),
    };
    router = { navigate: vi.fn() };
    localStorage = { getItem: vi.fn(() => 'ja-JP') };
    alerts = { error: vi.fn() };

    client.setConfig({ baseUrl: '/proxy' });
    TestBed.configureTestingModule({
      providers: [
        { provide: AppAuthState, useValue: auth },
        { provide: Router, useValue: router },
        { provide: LOCALSTORAGE, useValue: localStorage },
        { provide: ShipAlertService, useValue: alerts },
        {
          provide: ENVIRONMENT_TOKEN,
          useValue: {
            production: false,
            baseUrl: '/api',
            machineServerUrl: '',
            defaultTimeout: 30_000,
          },
        },
      ],
    });
  });

  afterEach(() => {
    client.setConfig({ baseUrl: '' });
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('adds authentication and the mapped UI locale to API requests', async () => {
    const request = new HttpRequest('GET', `${apiRoot}/v1/backups`);
    const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })));

    await firstValueFrom(runInterceptor(request, next));

    const forwarded = next.mock.calls[0][0];
    expect(forwarded.headers.get('Authorization')).toBe('Bearer initial-token');
    expect(forwarded.headers.get('X-Ui-Language')).toBe('ja');
  });

  it('does not add a UI locale header for en-US', async () => {
    localStorage.getItem.mockReturnValue('en-US');
    const request = new HttpRequest('GET', `${apiRoot}/v1/backups`);
    const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })));

    await firstValueFrom(runInterceptor(request, next));

    expect(next.mock.calls[0][0].headers.has('X-Ui-Language')).toBe(false);
  });

  it.each(['https://example.com/data', '/proxy/apiary/v1/data'])(
    'does not add authentication to requests outside the Duplicati API: %s',
    async (url) => {
      const request = new HttpRequest('GET', url);
      const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })));

      await firstValueFrom(runInterceptor(request, next));

      expect(next.mock.calls[0][0].headers.has('Authorization')).toBe(false);
    }
  );

  it('does not add authentication to proxy detection requests', async () => {
    const request = new HttpRequest('GET', `${apiRoot}/v1/auth/status`, {
      headers: new HttpHeaders({ 'custom-proxy-check': 'true' }),
    });
    const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })));

    await firstValueFrom(runInterceptor(request, next));

    expect(next.mock.calls[0][0].headers.has('Authorization')).toBe(false);
  });

  it('does not add authentication when using the relay dummy token', async () => {
    currentToken = dummytoken;
    const request = new HttpRequest('GET', `${apiRoot}/v1/backups`);
    const next = vi.fn((_request: HttpRequest<unknown>) => of(new HttpResponse({ status: 200 })));

    await firstValueFrom(runInterceptor(request, next));

    expect(next.mock.calls[0][0].headers.has('Authorization')).toBe(false);
  });

  it('refreshes an API request once and preserves its headers and locale', async () => {
    const request = new HttpRequest('GET', `${apiRoot}/v1/backups`, {
      headers: new HttpHeaders({ 'X-Custom': 'preserved' }),
    });
    const response = new HttpResponse({ status: 200, body: { ok: true } });
    const next = vi
      .fn<(request: HttpRequest<unknown>) => Observable<HttpEvent<unknown>>>()
      .mockReturnValueOnce(throwError(() => httpError(401, 'unauthorized')))
      .mockReturnValueOnce(of(response));

    await expect(firstValueFrom(runInterceptor(request, next))).resolves.toBe(response);

    expect(auth.refreshToken).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(2);
    const retried = next.mock.calls[1][0];
    expect(retried.headers.get('Authorization')).toBe('Bearer refreshed-token');
    expect(retried.headers.get('X-Ui-Language')).toBe('ja');
    expect(retried.headers.get('X-Custom')).toBe('preserved');
    expect(alerts.error).not.toHaveBeenCalled();
  });

  it('does not refresh or attach credentials after an external request returns 401', async () => {
    const request = new HttpRequest('GET', 'https://example.com/private');
    const next = vi.fn((_request: HttpRequest<unknown>) => throwError(() => httpError(401, 'unauthorized')));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toMatchObject({
      message: 'unauthorized',
    });

    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0][0].headers.has('Authorization')).toBe(false);
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(alerts.error).toHaveBeenCalledWith('unauthorized');
  });

  it.each(['login', 'logout'])('does not refresh failed auth %s requests', async (operation) => {
    const request = new HttpRequest('POST', `${apiRoot}/v1/auth/${operation}`, null);
    const next = vi.fn((_request: HttpRequest<unknown>) => throwError(() => httpError(401, 'unauthorized')));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toBeDefined();

    expect(next).toHaveBeenCalledOnce();
    expect(auth.refreshToken).not.toHaveBeenCalled();
  });

  it('logs out when the refresh endpoint returns 401', async () => {
    const request = new HttpRequest('POST', `${apiRoot}/v1/auth/refresh`, null);
    const next = vi.fn((_request: HttpRequest<unknown>) => throwError(() => httpError(401, 'unauthorized')));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toBeDefined();

    expect(auth.logout).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/logout']);
    expect(auth.refreshToken).not.toHaveBeenCalled();
    expect(alerts.error).not.toHaveBeenCalled();
  });

  it('turns unsuccessful API v2 responses into notified errors', async () => {
    const request = new HttpRequest('POST', `${apiRoot}/v2/command`, null);
    const response = new HttpResponse({
      status: 200,
      body: { Success: false, Error: 'command failed' },
    });
    const next = vi.fn((_request: HttpRequest<unknown>) => of(response));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toMatchObject({
      message: 'command failed',
      error: {
        requestBody: { Success: false, Error: 'command failed' },
      },
    });
    expect(alerts.error).toHaveBeenCalledWith('command failed');
  });

  it('notifies the user about regular API errors', async () => {
    const request = new HttpRequest('GET', `${apiRoot}/v1/backups`);
    const next = vi.fn((_request: HttpRequest<unknown>) => throwError(() => httpError(500, 'server failed')));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toMatchObject({
      message: 'server failed',
    });
    expect(alerts.error).toHaveBeenCalledWith('server failed');
  });

  it.each([
    [`${apiRoot}/v1/progressstate`, 404],
    [`${apiRoot}/v1/remoteoperation/test`, 500],
    [`${apiRoot}/v1/filesystem/validate`, 500],
  ])('suppresses notifications for expected errors from %s', async (url, status) => {
    const request = new HttpRequest('GET', url);
    const next = vi.fn((_request: HttpRequest<unknown>) => throwError(() => httpError(status, 'expected error')));

    await expect(firstValueFrom(runInterceptor(request, next))).rejects.toBeDefined();

    expect(alerts.error).not.toHaveBeenCalled();
  });
});
