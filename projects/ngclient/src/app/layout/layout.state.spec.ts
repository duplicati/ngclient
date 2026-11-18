import { DOCUMENT, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../core/openapi';
import { WINDOW } from '../core/providers/window';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { LayoutState } from './layout.state';

describe('LayoutState responsive navigation and theme', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(
    width = 1200,
    savedTheme: boolean | 'system' | null = null,
    platform = 'browser',
    serverSettings: Promise<Record<string, string>> = Promise.resolve({}),
    systemDark = false
  ) {
    const viewport = new EventTarget() as EventTarget & { innerWidth: number };
    viewport.innerWidth = width;
    const media = Object.assign(new EventTarget(), { matches: systemDark });
    Object.assign(viewport, { matchMedia: () => media });
    const removeMediaListener = vi.spyOn(media, 'removeEventListener');
    const document = { documentElement: { classList: documentClassList() } };
    const storage = { getItemParsed: vi.fn(() => savedTheme), setItemParsed: vi.fn(), removeItem: vi.fn() };
    const listen = vi.spyOn(viewport, 'addEventListener');
    const server = {
      getApiV1UisettingsByScheme: vi.fn(() => serverSettings),
      patchApiV1UisettingsByScheme: vi.fn(() => Promise.resolve({})),
    };
    TestBed.configureTestingModule({
      providers: [
        LayoutState,
        { provide: WINDOW, useValue: viewport },
        { provide: DOCUMENT, useValue: document },
        { provide: LOCALSTORAGE, useValue: storage },
        { provide: PLATFORM_ID, useValue: platform },
        { provide: DuplicatiServer, useValue: server },
      ],
    });
    const state = TestBed.inject(LayoutState);
    TestBed.tick();
    return {
      state,
      viewport,
      storage,
      server,
      classes: document.documentElement.classList,
      listen,
      media,
      removeMediaListener,
    };
  }
  function documentClassList() {
    return window.document.createElement('div').classList;
  }

  it.each([
    [1023, true, 'overlay', false],
    [1024, false, '', true],
  ] as const)('initializes navigation at width %i', (width, mobile, type, open) => {
    const { state } = setup(width);
    expect(state.isMobile()).toBe(mobile);
    expect(state.sidenavType()).toBe(type);
    expect(state.isNavOpen()).toBe(open);
  });

  it('switches navigation mode when crossing the mobile breakpoint', () => {
    const { state, viewport } = setup();
    viewport.innerWidth = 600;
    viewport.dispatchEvent(new Event('resize'));
    TestBed.tick();
    expect(state.isMobile()).toBe(true);
    expect(state.sidenavType()).toBe('overlay');
    expect(state.isNavOpen()).toBe(false);
    state.toggleNav();
    expect(state.isNavOpen()).toBe(true);
    viewport.innerWidth = 1400;
    viewport.dispatchEvent(new Event('resize'));
    TestBed.tick();
    expect(state.sidenavType()).toBe('');
    expect(state.isNavOpen()).toBe(true);
  });

  it('preserves a manually opened mobile navigation on resize within the same mode', () => {
    const { state, viewport } = setup(600);
    state.toggleNav();
    viewport.innerWidth = 700;
    viewport.dispatchEvent(new Event('resize'));
    TestBed.tick();
    expect(state.isNavOpen()).toBe(true);
  });

  it('restores a saved dark theme and persists explicit light and dark selections', () => {
    const { state, storage, classes } = setup(1200, true);
    expect(classes.contains('dark')).toBe(true);
    expect(classes.contains('light')).toBe(false);
    state.setThemeMode('light');
    TestBed.tick();
    expect(classes.contains('light')).toBe(true);
    expect(classes.contains('dark')).toBe(false);
    expect(storage.setItemParsed).toHaveBeenLastCalledWith('darkTheme', false, true);
    state.setThemeMode('dark');
    TestBed.tick();
    expect(classes.contains('dark')).toBe(true);
    expect(storage.setItemParsed).toHaveBeenLastCalledWith('darkTheme', true, true);
  });

  it('starts on the server default and reports each stored choice as its mode', () => {
    expect(setup().state.themeMode()).toBe('server');
    TestBed.resetTestingModule();
    expect(setup(1200, true).state.themeMode()).toBe('dark');
    TestBed.resetTestingModule();
    expect(setup(1200, false).state.themeMode()).toBe('light');
    TestBed.resetTestingModule();
    expect(setup(1200, 'system').state.themeMode()).toBe('system');
    TestBed.resetTestingModule();
    expect(setup(1200, 'blue' as never).state.themeMode()).toBe('server');
  });

  it('follows the operating system ahead of the server default when chosen explicitly', async () => {
    const { state, storage, media } = setup(1200, null, 'browser', Promise.resolve({ theme: 'dark' }));
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.isDarkMode()).toBe(true));
    state.setThemeMode('system');
    expect(state.themeMode()).toBe('system');
    expect(state.isDarkMode()).toBe(false);
    expect(storage.setItemParsed).toHaveBeenLastCalledWith('darkTheme', 'system', true);
    media.dispatchEvent(Object.assign(new Event('change'), { matches: true }));
    expect(state.isDarkMode()).toBe(true);
  });

  it('keeps ordinary theme selections private to this browser', () => {
    const { state, server } = setup();
    state.setThemeMode('dark');
    state.setThemeMode('system');
    state.setThemeMode('server');
    expect(server.patchApiV1UisettingsByScheme).not.toHaveBeenCalled();
  });

  it('does not write the theme to the server without an explicit selection', async () => {
    const { server } = setup(1200, true);
    await Promise.resolve();
    expect(server.patchApiV1UisettingsByScheme).not.toHaveBeenCalled();
  });

  it('preserves an explicit browser preference over the server default', async () => {
    const { state, storage, server, classes } = setup(1200, false, 'browser', Promise.resolve({ theme: 'dark' }));
    state.loadServerTheme();
    await new Promise((resolve) => setTimeout(resolve));
    TestBed.tick();
    expect(server.getApiV1UisettingsByScheme).toHaveBeenCalledWith({ path: { scheme: 'ngclient' } });
    expect(state.isDarkMode()).toBe(false);
    expect(classes.contains('light')).toBe(true);
    expect(storage.setItemParsed).not.toHaveBeenCalled();
    expect(server.patchApiV1UisettingsByScheme).not.toHaveBeenCalled();
  });

  it('uses the server default without turning it into a browser preference', async () => {
    const { state, storage } = setup(1200, null, 'browser', Promise.resolve({ theme: 'dark' }));
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.isDarkMode()).toBe(true));
    expect(storage.setItemParsed).not.toHaveBeenCalled();
  });

  it('returns to the server default when the browser override is cleared', async () => {
    const { state, storage } = setup(1200, false, 'browser', Promise.resolve({ theme: 'dark' }));
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.serverThemeLoaded()).toBe(true));
    expect(state.isDarkMode()).toBe(false);
    state.setThemeMode('server');
    expect(state.isDarkMode()).toBe(true);
    expect(state.themeMode()).toBe('server');
    expect(storage.removeItem).toHaveBeenCalledWith('darkTheme');
  });

  it('uses live OS preferences only when neither browser nor server chooses a theme', async () => {
    const { state, media, removeMediaListener } = setup(1200, null, 'browser', Promise.resolve({}), true);
    expect(state.isDarkMode()).toBe(true);
    media.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(state.isDarkMode()).toBe(false);
    state.setThemeMode('dark');
    media.dispatchEvent(Object.assign(new Event('change'), { matches: false }));
    expect(state.isDarkMode()).toBe(true);
    TestBed.resetTestingModule();
    expect(removeMediaListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('saves a shared default only through the explicit default-setting action', async () => {
    const { state, server, storage } = setup(1200, false);
    state.saveServerTheme('dark');
    expect(server.patchApiV1UisettingsByScheme).not.toHaveBeenCalled();
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.serverThemeLoaded()).toBe(true));
    state.saveServerTheme('dark');
    expect(state.serverThemeSaving()).toBe(true);
    state.saveServerTheme('light');
    expect(server.patchApiV1UisettingsByScheme).toHaveBeenCalledExactlyOnceWith({
      path: { scheme: 'ngclient' },
      body: { theme: 'dark' },
    });
    await vi.waitFor(() => expect(state.serverThemeSaving()).toBe(false));
    expect(state.serverTheme()).toBe('dark');
    expect(state.isDarkMode()).toBe(false);
    expect(storage.setItemParsed).not.toHaveBeenCalled();
    state.saveServerTheme('system');
    await vi.waitFor(() => expect(state.serverTheme()).toBe('system'));
    expect(server.patchApiV1UisettingsByScheme).toHaveBeenLastCalledWith({
      path: { scheme: 'ngclient' },
      body: { theme: 'system' },
    });
  });

  it('keeps the saved default and allows retry after a failed update', async () => {
    const { state, server } = setup(1200, null, 'browser', Promise.resolve({ theme: 'dark' }));
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.serverThemeLoaded()).toBe(true));
    server.patchApiV1UisettingsByScheme.mockRejectedValueOnce(new Error('offline'));
    state.saveServerTheme('light');
    await vi.waitFor(() => expect(state.serverThemeSaveError()).toBe(true));
    expect(state.serverTheme()).toBe('dark');
    expect(state.isDarkMode()).toBe(true);
    expect(state.serverThemeSaving()).toBe(false);
    state.saveServerTheme('light');
    await vi.waitFor(() => expect(state.serverTheme()).toBe('light'));
    expect(state.serverThemeSaveError()).toBe(false);
  });

  it('blocks shared changes when the default could not be loaded', async () => {
    const { state, server } = setup(1200, null, 'browser', Promise.reject(new Error('offline')));
    state.loadServerTheme();
    await vi.waitFor(() => expect(state.serverThemeLoadError()).toBe(true));
    state.saveServerTheme('dark');
    expect(server.patchApiV1UisettingsByScheme).not.toHaveBeenCalled();
  });

  it.each([
    ['has no theme', () => Promise.resolve({})],
    ['has an unknown theme', () => Promise.resolve({ theme: 'blue' })],
    ['cannot be read', () => Promise.reject(new Error('offline'))],
  ])('keeps the browser theme when the server %s', async (_, settings) => {
    const { state } = setup(1200, true, 'browser', settings());
    state.loadServerTheme();
    await new Promise((resolve) => setTimeout(resolve));
    expect(state.isDarkMode()).toBe(true);
  });

  it('keeps a selection made while the server theme was loading', async () => {
    let resolve!: (value: Record<string, string>) => void;
    const pending = new Promise<Record<string, string>>((r) => (resolve = r));
    const { state } = setup(1200, false, 'browser', pending);
    state.loadServerTheme();
    state.setThemeMode('light');
    resolve({ theme: 'dark' });
    await new Promise((r) => setTimeout(r));
    expect(state.isDarkMode()).toBe(false);
  });

  it('does not install a browser resize listener on the server', () => {
    const { listen } = setup(1200, null, 'server');
    expect(listen).not.toHaveBeenCalled();
  });
});
