import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, UpdatePollerStates } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { ServerStateService } from './server-state.service';
import { UpdateInstallService } from './update-install.service';

describe('UpdateInstallService confirmation and request guards', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const status = signal<{ UpdaterState: UpdatePollerStates; UpdatedVersion: string | null }>({
      UpdaterState: 'Waiting',
      UpdatedVersion: '2.4.2',
    });
    const info = signal({ UpdateInstallSupported: true });
    const confirmations: ((value: boolean) => void)[] = [];
    const open = vi.fn((_component: unknown, options: { closed: (value: boolean) => void }) => {
      confirmations.push(options.closed);
    });
    const installs: Subject<unknown>[] = [];
    const cancellations: Subject<unknown>[] = [];
    const install = vi.fn(() => {
      const response = new Subject<unknown>();
      installs.push(response);
      return response;
    });
    const cancel = vi.fn(() => {
      const response = new Subject<unknown>();
      cancellations.push(response);
      return response;
    });
    TestBed.configureTestingModule({
      providers: [
        UpdateInstallService,
        {
          provide: DuplicatiServer,
          useValue: { postApiV1UpdatesInstall: install, postApiV1UpdatesCancelInstall: cancel },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: SysinfoState, useValue: { systemInfo: info } },
        { provide: ServerStateService, useValue: { serverState: status } },
      ],
    });
    return {
      service: TestBed.inject(UpdateInstallService),
      status,
      info,
      open,
      confirmations,
      install,
      cancel,
      installs,
      cancellations,
    };
  }
  it('does not prompt when installation is unavailable', () => {
    const { service, info, open, install } = setup();
    info.set({ UpdateInstallSupported: false });
    service.install();
    expect(open).not.toHaveBeenCalled();
    expect(install).not.toHaveBeenCalled();
  });
  it('keeps one confirmation open and allows another after cancellation', () => {
    const { service, open, confirmations, install, installs } = setup();
    service.install();
    service.install();
    expect(open).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
    confirmations[0](false);
    service.install();
    expect(open).toHaveBeenCalledTimes(2);
    confirmations[1](true);
    expect(install).toHaveBeenCalledTimes(1);
    expect(service.requestPending()).toBe(true);
    service.install();
    expect(open).toHaveBeenCalledTimes(2);
    installs[0].complete();
    expect(service.requestPending()).toBe(false);
  });
  it('does not install a different version from the one the user confirmed', () => {
    const { service, status, confirmations, install } = setup();
    service.install();
    status.set({ UpdaterState: 'Waiting', UpdatedVersion: '2.4.3' });
    confirmations[0](true);
    expect(install).not.toHaveBeenCalled();
    expect(service.requestPending()).toBe(false);
  });
  it.each(['Downloading', 'Verifying', 'LaunchingHelper', 'Installing'] as const)(
    'rechecks the %s state when confirmation closes',
    (state) => {
      const { service, status, confirmations, install } = setup();
      service.install();
      status.set({ UpdaterState: state, UpdatedVersion: '2.4.2' });
      confirmations[0](true);
      expect(install).not.toHaveBeenCalled();
    }
  );
  it('rechecks server support when confirmation closes', () => {
    const { service, info, confirmations, install } = setup();
    service.install();
    info.set({ UpdateInstallSupported: false });
    confirmations[0](true);
    expect(install).not.toHaveBeenCalled();
  });
  it('only cancels a cancellable update and sends one pending cancel request', () => {
    const { service, status, cancel, cancellations } = setup();
    service.cancel();
    expect(cancel).not.toHaveBeenCalled();
    status.set({ UpdaterState: 'Downloading', UpdatedVersion: '2.4.2' });
    service.cancel();
    service.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
    cancellations[0].complete();
    expect(service.requestPending()).toBe(false);
    status.set({ UpdaterState: 'Installing', UpdatedVersion: '2.4.2' });
    service.cancel();
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it('allows another confirmed attempt after a failed install request', () => {
    const { service, confirmations, install, installs } = setup();
    service.install();
    confirmations[0](true);
    installs[0].error(new Error('unavailable'));
    expect(service.requestPending()).toBe(false);
    service.install();
    confirmations[1](true);
    expect(install).toHaveBeenCalledTimes(2);
    installs[1].complete();
  });
});
