import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { localStorageSignal } from '../functions/localstorage-signal';
import { LOCALSTORAGE } from './localstorage.token';

describe('LOCALSTORAGE parsed preferences', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  function storage(platform = 'browser') {
    TestBed.configureTestingModule({ providers: [LOCALSTORAGE, { provide: PLATFORM_ID, useValue: platform }] });
    return TestBed.inject(LOCALSTORAGE);
  }

  it.each([false, true])(
    'uses the correct namespace for persisted=%s and returns null for a missing preference',
    (persistent) => {
      const service = storage();
      const key = persistent ? 'v1:persist:duplicati:option' : 'v1:duplicati:option';
      expect(service.getItemParsed('option', persistent)).toBeNull();
      localStorage.setItem(key, 'false');
      expect(service.getItemParsed('option', persistent)).toBe(false);
    }
  );

  it.each(['', '{broken', 'undefined', 'text', '{"unfinished":'])(
    'treats malformed JSON %j as an unset preference without removing any stored value',
    (raw) => {
      const service = storage();
      localStorage.setItem('v1:persist:duplicati:darkTheme', raw);
      localStorage.setItem('v1:persist:duplicati:refreshNonce', 'opaque-auth-value');
      localStorage.setItem('another-app:key', 'keep');
      expect(() => service.getItemParsed('darkTheme', true)).not.toThrow();
      expect(service.getItemParsed('darkTheme', true)).toBeNull();
      expect(localStorage.getItem('v1:persist:duplicati:darkTheme')).toBe(raw);
      expect(localStorage.getItem('v1:persist:duplicati:refreshNonce')).toBe('opaque-auth-value');
      expect(localStorage.getItem('another-app:key')).toBe('keep');
    }
  );

  it.each([false, true, 0, '', 'text', null, [1, 2], { value: 'saved' }])('preserves valid JSON value %j', (value) => {
    const service = storage();
    localStorage.setItem('v1:duplicati:option', JSON.stringify(value));
    expect(service.getItemParsed('option')).toEqual(value);
  });

  it('leaves raw storage reads unchanged', () => {
    const service = storage();
    localStorage.setItem('v1:duplicati:opaque', 'not JSON');
    expect(service.getItem('opaque')).toBe('not JSON');
  });

  it('falls back through the real localStorageSignal and can persist a new preference', () => {
    storage();
    localStorage.setItem('v1:persist:duplicati:darkTheme', '{broken');
    const preference = TestBed.runInInjectionContext(() => localStorageSignal<boolean | null>('darkTheme', null, true));
    expect(preference()).toBeNull();
    preference.set(true);
    expect(localStorage.getItem('v1:persist:duplicati:darkTheme')).toBe('true');
    expect(preference()).toBe(true);
  });

  it('does not hide storage access failures as JSON errors', () => {
    const service = storage();
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('Storage unavailable');
      },
    });
    expect(() => service.getItemParsed('option')).toThrow('Storage unavailable');
  });

  it('never accesses browser storage on the server', () => {
    const service = storage('server');
    const read = vi.fn(() => {
      throw new Error('Browser storage must not be accessed');
    });
    vi.stubGlobal('localStorage', { getItem: read });
    expect(service.getItemParsed('option')).toBeNull();
    expect(read).not.toHaveBeenCalled();
  });
});
