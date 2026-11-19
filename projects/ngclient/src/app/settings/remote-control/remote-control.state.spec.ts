import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, RemoteControlStatusOutput } from '../../core/openapi';
import { WINDOW } from '../../core/providers/window';
import { ServerStateService } from '../../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../../core/services/server-status-websocket.service';
import { RelayconfigState } from '../../core/states/relayconfig.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../server-settings.service';
import { RemoteControlState } from './remote-control.state';

describe('RemoteControlState', () => {
  afterEach(() => TestBed.resetTestingModule());

  const remoteControlState = signal<RemoteControlStatusOutput | null>(null);

  const setup = (relayIsEnabled: boolean) => {
    remoteControlState.set(null);
    TestBed.configureTestingModule({
      providers: [
        RemoteControlState,
        { provide: WINDOW, useValue: window },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        {
          provide: SysinfoState,
          useValue: { systemInfo: signal(null), hasWsRemoteControl: signal(false) },
        },
        {
          provide: ServerStatusWebSocketService,
          useValue: { subscribe: vi.fn(), remoteControlState },
        },
        {
          provide: ServerStateService,
          useValue: {
            isConnectionMethodSet: signal(false),
            getConnectionMethod: () => 'longpoll',
          },
        },
        { provide: ServerSettingsService, useValue: { serverSettings: signal(null) } },
        { provide: RelayconfigState, useValue: { relayIsEnabled: signal(relayIsEnabled) } },
      ],
    });

    const state = TestBed.inject(RemoteControlState);
    TestBed.tick();

    return state;
  };

  it('starts in unknown state without relay', () => {
    const state = setup(false);

    expect(state.state()).toBe('unknown');
  });

  it('is connected when the websocket relay is enabled', () => {
    const state = setup(true);

    expect(state.state()).toBe('connected');
    expect(state.statusMessage()).toBe('Connected to console');
  });

  it('reports a pause requested by the console', () => {
    const state = setup(false);
    const pausedUntil = new Date(Date.now() + 60 * 60 * 1000);

    remoteControlState.set({ CanEnable: true, IsEnabled: true, IsConnected: false, PausedUntil: pausedUntil.toISOString() });
    TestBed.tick();

    expect(state.state()).toBe('connecting');
    expect(state.statusMessage()).toBe(
      `Console connection is paused by the console until ${pausedUntil.toLocaleString()}`
    );
  });

  it('reports not connected when the connection is not paused', () => {
    const state = setup(false);

    remoteControlState.set({ CanEnable: true, IsEnabled: true, IsConnected: false, PausedUntil: null });
    TestBed.tick();

    expect(state.pausedUntil()).toBeNull();
    expect(state.statusMessage()).toBe('Console connection is enabled but not connected');
  });
});
