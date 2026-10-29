import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, RouterPreloader, withPreloading, Route } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { lastValueFrom, Observable, of, Subject, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { routes } from '../../app.routes';
import backupRoutes from '../../backup/backup.routes';
import { AppAuthState } from '../states/app-auth.state';
import { StartupPreloadingStrategy } from './startup-preloading.strategy';

@Component({ template: 'Home' })
class Home {}
@Component({ template: 'Lazy' })
class Lazy {}

describe('startup preloading', () => {
  let token = signal<string | null>(null);
  let strategy: StartupPreloadingStrategy;
  beforeEach(() => {
    token = signal<string | null>(null);
    TestBed.configureTestingModule({ providers: [{ provide: AppAuthState, useValue: { token } }] });
    strategy = TestBed.inject(StartupPreloadingStrategy);
  });
  afterEach(() => TestBed.resetTestingModule());

  it.each([undefined, {}, { preload: false }, { preload: true }, { preload: 'all' }])(
    'does not preload an unselected route (%j)',
    async (data) => {
      const load = vi.fn(() => of('loaded'));
      await lastValueFrom(strategy.preload({ data }, load));
      expect(load).not.toHaveBeenCalled();
    }
  );
  it('preloads the shell without authentication and defers the factory until subscription', async () => {
    const load = vi.fn(() => of('loaded'));
    const result = strategy.preload({ data: { preload: 'shell' } }, load);
    expect(load).not.toHaveBeenCalled();
    expect(await lastValueFrom(result)).toBe('loaded');
    expect(load).toHaveBeenCalledOnce();
  });
  it('waits for a later authenticated scan before preloading selected private routes', async () => {
    const load = vi.fn(() => of('loaded'));
    const route = { data: { preload: 'authenticated' } };
    await lastValueFrom(strategy.preload(route, load));
    expect(load).not.toHaveBeenCalled();
    token.set('access-token');
    expect(await lastValueFrom(strategy.preload(route, load))).toBe('loaded');
    expect(load).toHaveBeenCalledOnce();
  });
  it('also accepts the existing proxy-authenticated token', async () => {
    token.set('PROXY_AUTHED_FAKE_TOKEN');
    const load = vi.fn(() => of('loaded'));
    expect(await lastValueFrom(strategy.preload({ data: { preload: 'authenticated' } }, load))).toBe('loaded');
  });
  it.each(['synchronous', 'observable'])('ignores a %s background error and permits retry', async (mode) => {
    const error = new Error('chunk request failed');
    const load = vi.fn((): Observable<unknown> => {
      if (mode === 'synchronous') throw error;
      return throwError(() => error);
    });
    await expect(lastValueFrom(strategy.preload({ data: { preload: 'shell' } }, load))).resolves.toBeNull();
    load.mockImplementation(() => of('retry'));
    await expect(lastValueFrom(strategy.preload({ data: { preload: 'shell' } }, load))).resolves.toBe('retry');
  });
  it('preserves pending request cancellation', () => {
    const response = new Subject();
    const subscription = strategy.preload({ data: { preload: 'shell' } }, () => response).subscribe();
    expect(response.observed).toBe(true);
    subscription.unsubscribe();
    expect(response.observed).toBe(false);
  });
  it('preloads only shell/home and the selected authenticated entry points', () => {
    const selected: string[] = [];
    const visit = (items: Route[], parent = '') => {
      for (const route of items) {
        const path = [parent, route.path].filter(Boolean).join('/');
        if (route.data?.['preload']) selected.push('/' + path + ':' + route.data['preload']);
        if (route.children) visit(route.children, path);
      }
    };
    visit(routes);
    expect(selected.sort()).toEqual(
      ['/:shell', '/:shell', '/backup/:id:authenticated', '/restore:authenticated', '/settings:authenticated'].sort()
    );
    expect(backupRoutes.filter((route) => route.data?.['preload']).map((route) => route.path)).toEqual(['general']);
  });
});

it('normal navigation retries a component whose background preload failed', async () => {
  const load = vi.fn().mockRejectedValueOnce(new Error('temporary failure')).mockResolvedValue(Lazy);
  TestBed.configureTestingModule({
    providers: [
      { provide: AppAuthState, useValue: { token: signal(null) } },
      provideRouter(
        [
          { path: '', component: Home },
          { path: 'lazy', loadComponent: load, data: { preload: 'shell' } },
        ],
        withPreloading(StartupPreloadingStrategy)
      ),
    ],
  });
  try {
    const harness = await RouterTestingHarness.create();
    await lastValueFrom(TestBed.inject(RouterPreloader).preload(), { defaultValue: null });
    expect(load).toHaveBeenCalledOnce();
    await harness.navigateByUrl('/lazy', Lazy);
    expect(harness.routeNativeElement?.textContent).toBe('Lazy');
    expect(load).toHaveBeenCalledTimes(2);
  } finally {
    TestBed.resetTestingModule();
  }
});
