import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject, Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, GetApiV1ServersettingsResponse } from '../core/openapi';
import { ServerStateService } from '../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../core/services/server-status-websocket.service';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from './server-settings.service';

describe('ServerSettingsService', () => {
  const subscriptions: Subscription[] = [];
  const responses: { complete(): void }[] = [];

  afterEach(() => {
    subscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    responses.splice(0).forEach((response) => response.complete());
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const setup = () => {
    const getResponses: Subject<GetApiV1ServersettingsResponse>[] = [];
    const patchResponses: Subject<unknown>[] = [];
    const getSettings = vi.fn(() => {
      const response = new Subject<GetApiV1ServersettingsResponse>();
      getResponses.push(response);
      responses.push(response);
      return response;
    });
    const patchSettings = vi.fn(() => {
      const response = new Subject<unknown>();
      patchResponses.push(response);
      responses.push(response);
      return response;
    });
    const websocket = {
      serverSettings: signal<GetApiV1ServersettingsResponse | null>(null),
      subscribe: vi.fn(),
    };
    const connectionMethod = signal<'longpoll' | 'websocket'>('longpoll');
    TestBed.configureTestingModule({
      providers: [
        ServerSettingsService,
        {
          provide: DuplicatiServer,
          useValue: { getApiV1Serversettings: getSettings, patchApiV1Serversettings: patchSettings },
        },
        { provide: ServerStatusWebSocketService, useValue: websocket },
        { provide: ServerStateService, useValue: { getConnectionMethod: connectionMethod } },
        { provide: SysinfoState, useValue: { systemInfo: signal({ StartedBy: 'Server' }) } },
      ],
    });
    const service = TestBed.inject(ServerSettingsService);
    return { service, getSettings, patchSettings, getResponses, patchResponses, websocket, connectionMethod };
  };

  it('requests initial settings and exposes the response without an extra request', () => {
    const { service, getSettings, getResponses, websocket } = setup();
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(websocket.subscribe).toHaveBeenCalledExactlyOnceWith('serversettings');
    expect(service.serverSettings()).toBeUndefined();
    expect(service.isConsoleConnectionStatusHidden()).toBe(false);
    expect(service.isControllerIpcEnabled()).toBe(false);
    const settings = { 'update-channel': 'stable', 'startup-delay': '5m' };
    getResponses[0].next(settings);
    getResponses[0].complete();
    expect(service.serverSettings()).toBe(settings);
    expect(getSettings).toHaveBeenCalledTimes(1);
  });

  it('prefers websocket settings over a late initial HTTP response and follows later updates', () => {
    const { service, getResponses, websocket } = setup();
    websocket.serverSettings.set({ 'update-channel': 'beta' });
    TestBed.tick();
    expect(service.serverSettings()).toEqual({ 'update-channel': 'beta' });
    getResponses[0].next({ 'update-channel': 'stable' });
    getResponses[0].complete();
    expect(service.serverSettings()).toEqual({ 'update-channel': 'beta' });
    websocket.serverSettings.set({ 'update-channel': 'canary' });
    TestBed.tick();
    expect(service.serverSettings()).toEqual({ 'update-channel': 'canary' });
  });

  it('does not erase existing settings when websocket settings are absent', () => {
    const { service, websocket } = setup();
    const settings = { 'update-channel': 'beta' };
    websocket.serverSettings.set(settings);
    TestBed.tick();
    websocket.serverSettings.set(null);
    TestBed.tick();
    expect(service.serverSettings()).toBe(settings);
  });

  it('refreshes settings over HTTP in long-poll mode and retains the current value while waiting', () => {
    const { service, getSettings, getResponses } = setup();
    getResponses[0].next({ 'update-channel': 'stable' });
    getResponses[0].complete();
    service.refreshServerSettings();
    expect(getSettings).toHaveBeenCalledTimes(2);
    expect(service.serverSettings()).toEqual({ 'update-channel': 'stable' });
    getResponses[1].next({ 'update-channel': 'beta' });
    getResponses[1].complete();
    expect(service.serverSettings()).toEqual({ 'update-channel': 'beta' });
  });

  it('does not send an HTTP refresh in websocket mode', () => {
    const { service, getSettings, getResponses, connectionMethod } = setup();
    getResponses[0].next({ 'update-channel': 'stable' });
    getResponses[0].complete();
    connectionMethod.set('websocket');
    service.refreshServerSettings();
    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(service.serverSettings()).toEqual({ 'update-channel': 'stable' });
  });

  it.each([
    ['true', true],
    ['1', true],
    ['yes', true],
    ['on', true],
    [' TrUe ', true],
    [' YES ', true],
    ['false', false],
    ['0', false],
    ['off', false],
    ['', false],
    ['   ', false],
    ['unknown', false],
    [undefined, false],
  ] as const)('interprets boolean setting %j as %s', (value, expected) => {
    const { service, getResponses } = setup();
    const settings: GetApiV1ServersettingsResponse =
      value === undefined
        ? {}
        : {
            'hide-console-connection-status': value,
            'use-out-of-process-controller': value,
          };
    getResponses[0].next(settings);
    expect(service.isConsoleConnectionStatusHidden()).toBe(expected);
    expect(service.isControllerIpcEnabled()).toBe(expected);
  });

  it('optimistically patches settings, removes null-valued keys, and retains the update after success', () => {
    const { service, getResponses, patchSettings, patchResponses } = setup();
    const original = Object.freeze({ retained: 'keep', changed: 'old', removed: 'remove me' });
    getResponses[0].next(original);
    getResponses[0].complete();
    const update = Object.freeze({ changed: 'new', removed: null, added: 'value' });
    const next = vi.fn();
    const complete = vi.fn();
    subscriptions.push(service.patchServerSettings(update).subscribe({ next, complete }));
    expect(patchSettings).toHaveBeenCalledExactlyOnceWith({ body: update });
    expect(service.serverSettings()).toEqual({ retained: 'keep', changed: 'new', added: 'value' });
    expect(service.serverSettings()).not.toBe(original);
    expect(next).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
    const result = { success: true };
    patchResponses[0].next(result);
    patchResponses[0].complete();
    expect(next).toHaveBeenCalledExactlyOnceWith(result);
    expect(complete).toHaveBeenCalledTimes(1);
    expect(service.serverSettings()).toEqual({ retained: 'keep', changed: 'new', added: 'value' });
    expect(original).toEqual({ retained: 'keep', changed: 'old', removed: 'remove me' });
    expect(update).toEqual({ changed: 'new', removed: null, added: 'value' });
  });

  it.each(['http', 'websocket'] as const)(
    'restores settings loaded through %s and propagates a PATCH error',
    (source) => {
      const { service, getResponses, websocket, patchResponses } = setup();
      const original = Object.freeze({ retained: 'keep', changed: 'old', removed: 'restore me' });
      if (source === 'http') getResponses[0].next(original);
      else {
        websocket.serverSettings.set(original);
        TestBed.tick();
      }
      const next = vi.fn();
      const error = vi.fn();
      const complete = vi.fn();
      subscriptions.push(
        service
          .patchServerSettings({ changed: 'new', removed: null, added: 'temporary' })
          .subscribe({ next, error, complete })
      );
      expect(service.serverSettings()).toEqual({ retained: 'keep', changed: 'new', added: 'temporary' });
      const failure = new Error('PATCH failed');
      patchResponses[0].error(failure);
      expect(error).toHaveBeenCalledExactlyOnceWith(failure);
      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
      expect(service.serverSettings()).toEqual(original);
      expect(original).toEqual({ retained: 'keep', changed: 'old', removed: 'restore me' });
    }
  );

  it.each(['new value', null])('passes a single setting value %j to PATCH', (value) => {
    const { service, getResponses, patchSettings, patchResponses } = setup();
    getResponses[0].next({ example: 'old value', retained: 'keep' });
    subscriptions.push(service.patchServerSetting('example', value).subscribe());
    expect(patchSettings).toHaveBeenCalledExactlyOnceWith({ body: { example: value } });
    expect(service.serverSettings()).toEqual(
      value === null ? { retained: 'keep' } : { example: value, retained: 'keep' }
    );
    patchResponses[0].complete();
  });

  it.each([true, false])('writes the canonical boolean %s for console connection visibility', (hide) => {
    const { service, patchSettings, patchResponses } = setup();
    subscriptions.push(service.setHideConsoleConnectionStatus(hide).subscribe());
    expect(patchSettings).toHaveBeenCalledExactlyOnceWith({
      body: { 'hide-console-connection-status': hide ? 'True' : 'False' },
    });
    expect(service.isConsoleConnectionStatusHidden()).toBe(hide);
    patchResponses[0].complete();
  });
});
