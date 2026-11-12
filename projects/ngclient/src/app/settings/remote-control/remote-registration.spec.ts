import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, RemoteControlStatusOutput, SystemInfoDto } from '../../core/openapi';
import { WINDOW } from '../../core/providers/window';
import { ServerStateService } from '../../core/services/server-state.service';
import { ServerStatusWebSocketService } from '../../core/services/server-status-websocket.service';
import { RelayconfigState } from '../../core/states/relayconfig.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import Connect from '../../welcome/connect/connect';
import { ServerSettingsService } from '../server-settings.service';
import { RemoteControlComponent } from './remote-control.component';
import { RemoteControlState } from './remote-control.state';

describe('remote registration Signal Form', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(welcome = false) {
    const response = new Subject<RemoteControlStatusOutput>();
    const register = vi.fn(() => response);
    const systemInfo = signal<SystemInfoDto | null>(null);
    TestBed.configureTestingModule({
      imports: [RemoteControlComponent, Connect],
      providers: [
        provideRouter([]),
        RemoteControlState,
        { provide: WINDOW, useValue: window },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: { postApiV1RemotecontrolRegister: register } },
        {
          provide: SysinfoState,
          useValue: { systemInfo, hasWsRemoteControl: signal(false), hasWebSocket: signal(false) },
        },
        { provide: ServerStatusWebSocketService, useValue: { subscribe: vi.fn(), remoteControlState: signal(null) } },
        {
          provide: ServerStateService,
          useValue: { isConnectionMethodSet: signal(false), getConnectionMethod: () => 'longpoll' },
        },
        { provide: ServerSettingsService, useValue: { serverSettings: signal(null) } },
        { provide: RelayconfigState, useValue: { relayIsEnabled: signal(false) } },
      ],
    });
    const state = TestBed.inject(RemoteControlState);
    state.state.set('inactive');
    const fixture = welcome ? TestBed.createComponent(Connect) : TestBed.createComponent(RemoteControlComponent);
    if (welcome) fixture.componentRef.setInput('typeParam', 'link');
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#remoteControlRegisterUrl') as HTMLInputElement;
    return { fixture, input, state, register, systemInfo };
  }

  it.each([false, true])('sends the exact URL entered on the registration screen (welcome=%s)', (welcome) => {
    const { fixture, input, state, register } = setup(welcome);
    const url = welcome
      ? 'https://console.example/register?token=a+b&other=x'
      : 'https://console.example/register?token=a%2Bb&other=x';
    input.value = url;
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(welcome ? state.customRegisterUrl() : state.registerUrl()).toBe(url);
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (x) => x.textContent?.includes(welcome ? 'Connect machine to console' : 'Register on console')
    )!;
    expect(button.disabled).toBe(false);
    button.click();
    expect(register).toHaveBeenCalledExactlyOnceWith({ body: { RegistrationUrl: url } });
  });

  it('updates the settings input from server system information', () => {
    const { fixture, input, state, systemInfo } = setup();
    systemInfo.set({ RemoteControlRegistrationUrl: 'https://console.example/default' } as SystemInfoDto);
    fixture.detectChanges();
    expect(input.value).toBe('https://console.example/default');
    expect(state.registrationForm.registerUrl().value()).toBe(input.value);
  });

  it('retains the welcome URL validity gate and clears the same form value on retry', () => {
    const { fixture, input, state, register } = setup(true);
    input.value = 'invalid';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
      (x) => x.textContent?.includes('Connect machine to console')
    )!;
    expect(button.disabled).toBe(true);
    expect(register).not.toHaveBeenCalled();
    state.customRegisterUrl.set('https://console.example/custom');
    fixture.detectChanges();
    expect(input.value).toBe('https://console.example/custom');
    vi.spyOn(state, 'cancelRemoteRegistration').mockImplementation(() => {});
    (fixture.componentInstance as Connect).retryWhenFaulted();
    fixture.detectChanges();
    expect(state.registrationForm.customRegisterUrl().value()).toBe('');
    expect(input.value).toBe('');
  });
});
