import { DOCUMENT, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WINDOW } from '../core/providers/window';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { LayoutState } from './layout.state';

describe('LayoutState responsive navigation and theme', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(width = 1200, savedTheme: boolean | null = null, platform = 'browser') {
    const viewport = new EventTarget() as EventTarget & { innerWidth: number };
    viewport.innerWidth = width;
    const document = { documentElement: { classList: documentClassList() } };
    const storage = { getItemParsed: vi.fn(() => savedTheme), setItemParsed: vi.fn(), removeItem: vi.fn() };
    const listen = vi.spyOn(viewport, 'addEventListener');
    TestBed.configureTestingModule({
      providers: [
        LayoutState,
        { provide: WINDOW, useValue: viewport },
        { provide: DOCUMENT, useValue: document },
        { provide: LOCALSTORAGE, useValue: storage },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    const state = TestBed.inject(LayoutState);
    TestBed.tick();
    return { state, viewport, storage, classes: document.documentElement.classList, listen };
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
    state.setLightMode();
    TestBed.tick();
    expect(classes.contains('light')).toBe(true);
    expect(classes.contains('dark')).toBe(false);
    expect(storage.setItemParsed).toHaveBeenLastCalledWith('darkTheme', false, true);
    state.setDarkMode();
    TestBed.tick();
    expect(classes.contains('dark')).toBe(true);
    expect(storage.setItemParsed).toHaveBeenLastCalledWith('darkTheme', true, true);
  });

  it('starts with the light theme and toggles it persistently', () => {
    const { state, storage, classes } = setup();
    expect(classes.contains('light')).toBe(true);
    state.toggleBodyClass();
    TestBed.tick();
    expect(classes.contains('dark')).toBe(true);
    expect(storage.setItemParsed).toHaveBeenCalledWith('darkTheme', true, true);
  });

  it('does not install a browser resize listener on the server', () => {
    const { listen } = setup(1200, null, 'server');
    expect(listen).not.toHaveBeenCalled();
  });
});
