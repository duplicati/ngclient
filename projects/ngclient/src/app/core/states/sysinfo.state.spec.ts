import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Subject } from 'rxjs';
import { DuplicatiServer, SystemInfoDto } from '../openapi';
import { SysinfoState } from './sysinfo.state';

describe('SysinfoState server capabilities', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(server = {}) {
    TestBed.configureTestingModule({ providers: [SysinfoState, { provide: DuplicatiServer, useValue: server }] });
    return TestBed.inject(SysinfoState);
  }

  it.each([
    [[], false],
    [['v2:backup:list-filesets'], false],
    [['v2:backup:list-folder'], false],
    [['v2:backup:list-filesets', 'v2:backup:list-folder'], true],
  ])('requires both v2 listing operations: %j', (extensions, expected) => {
    const state = setup();
    expect(state.hasV2ListOperations()).toBe(false);
    state.systemInfo.set({ APIExtensions: extensions } as SystemInfoDto);
    expect(state.hasV2ListOperations()).toBe(expected);
    state.systemInfo.set(null);
    expect(state.hasV2ListOperations()).toBe(false);
  });

  it.each([
    [[], false],
    [['v2:backup:list-broken-files'], false],
    [['v2:backup:purge-broken-files'], false],
    [['v2:backup:list-broken-files', 'v2:backup:purge-broken-files'], true],
  ])('requires both broken-file operations: %j', (extensions, expected) => {
    const state = setup();
    state.systemInfo.set({ APIExtensions: extensions } as SystemInfoDto);
    expect(state.hasV2BrokenFiles()).toBe(expected);
  });

  it.each([
    [false, false, false],
    [true, false, false],
    [false, true, false],
    [true, true, true],
  ])('requires restore options and the registration argument (%s, %s)', (extension, option, expected) => {
    const state = setup();
    state.systemInfo.set({
      APIExtensions: extension ? ['v1:backup:restore-options'] : [],
      Options: option ? [{ Name: 'register-restored-items' }] : [],
    } as SystemInfoDto);
    expect(state.hasRegisterRestoredItems()).toBe(expected);
  });

  it('publishes capabilities only after a deferred system-info request responds', () => {
    const response = new Subject<SystemInfoDto>();
    const getApiV1Systeminfo = vi.fn(() => response);
    const state = setup({ getApiV1Systeminfo });
    const request = state.preload(true)!;
    expect(getApiV1Systeminfo).not.toHaveBeenCalled();
    request.subscribe();
    expect(state.isLoaded()).toBe(false);
    expect(state.hasWebSocket()).toBe(false);
    response.next({ APIExtensions: ['v1:websocket'] } as SystemInfoDto);
    expect(state.hasWebSocket()).toBe(true);
    response.complete();
    expect(state.isLoaded()).toBe(true);
    expect(getApiV1Systeminfo).toHaveBeenCalledOnce();
  });

  it('expands module choices while preserving default and deprecated option metadata', () => {
    const state = setup();
    state.systemInfo.set({
      Options: [
        {
          Name: 'encryption-module',
          Type: 'String',
          DefaultValue: 'aes',
          Deprecated: true,
          DeprecationMessage: 'Use another module',
        },
      ],
      ServerOnlyOptions: [{ Name: 'server-port', Type: 'Integer' }],
      EncryptionModules: [
        { Key: 'aes', DisplayName: 'AES', Options: [{ Name: 'aes-key', Type: 'Password' }] },
        { Key: null },
      ],
      GenericModules: [{ Key: 'report', Options: [{ Name: 'report-url', Type: 'String' }] }],
    } as SystemInfoDto);
    expect(state.allOptionsGrouped()[0].options).toEqual([
      expect.objectContaining({
        name: 'encryption-module',
        type: 'Enumeration',
        options: ['aes'],
        defaultValue: 'aes',
        deprecatedDescription: 'Use another module',
      }),
      expect.objectContaining({ name: 'server-port', type: 'Integer' }),
    ]);
    expect(state.allOptionsGrouped().find((x) => x.displayName === 'report')?.options[0].name).toBe('report-url');
    expect(state.allOptions().map((x) => x.name)).toEqual([
      'encryption-module',
      'server-port',
      'report-url',
      'aes-key',
    ]);
    state.systemInfo.set(null);
    expect(state.allOptions()).toEqual([]);
  });
});
