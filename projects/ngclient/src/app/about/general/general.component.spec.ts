import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { config, ObservableInput, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ServerStatusDto } from '../../core/openapi';
import { ServerStateService } from '../../core/services/server-state.service';
import { UpdateInstallService } from '../../core/services/update-install.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import GeneralComponent from './general.component';

// Render the real template so disabled state and request guards are checked together.
describe('GeneralComponent update check lifecycle', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    const acknowledgements = new Subject<{ Acknowledgements: string }>();
    const requests: Subject<unknown>[] = [];
    const check = vi.fn((): ObservableInput<unknown> => {
      const response = new Subject<unknown>();
      requests.push(response);
      return response;
    });
    const serverState = signal<Partial<ServerStatusDto>>({ UpdaterState: 'Waiting' });
    TestBed.configureTestingModule({
      imports: [GeneralComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { getApiV1Acknowledgements: () => acknowledgements, postApiV1UpdatesCheck: check },
        },
        { provide: ServerStateService, useValue: { serverState } },
        { provide: SysinfoState, useValue: { systemInfo: signal({ ServerVersionName: 'Test version' }) } },
        {
          provide: UpdateInstallService,
          useValue: { installSupported: () => false, canCancel: () => false, installing: () => false },
        },
      ],
    });
    const fixture = TestBed.createComponent(GeneralComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, acknowledgements, requests, check, serverState };
  }

  it('preserves version and acknowledgements loading and releases the reading on destroy', () => {
    const { fixture, component, acknowledgements } = setup();
    expect(fixture.nativeElement.textContent).toContain('Test version');
    expect(component.isLoading()).toBe(true);
    expect(acknowledgements.observed).toBe(true);
    acknowledgements.next({ Acknowledgements: 'Credits' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Credits');
    fixture.destroy();
    expect(acknowledgements.observed).toBe(false);
    expect(component.isLoading()).toBe(false);
  });

  it('disables the pending check and prevents another request even through a direct method call', () => {
    const { fixture, component, requests, check } = setup();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(button.disabled).toBe(true);
    component.checkForUpdates();
    expect(check).toHaveBeenCalledTimes(1);
    requests[0].next({});
    requests[0].complete();
    fixture.detectChanges();
    expect(button.disabled).toBe(false);
    button.click();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('does not send a check while the server is already checking', () => {
    const { fixture, component, serverState, check } = setup();
    serverState.set({ UpdaterState: 'Checking' });
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.textContent).toContain('Checking for updates');
    expect(button.disabled).toBe(true);
    component.checkForUpdates();
    expect(check).not.toHaveBeenCalled();
  });

  it('releases a pending observable check on destruction and rejects later calls on the old component', () => {
    const { fixture, component, requests, check } = setup();
    component.checkForUpdates();
    expect(requests[0].observed).toBe(true);
    fixture.destroy();
    expect(requests[0].observed).toBe(false);
    expect(component.checkingForUpdates()).toBe(false);
    requests[0].next({});
    requests[0].error(new Error('late failure'));
    component.checkForUpdates();
    expect(check).toHaveBeenCalledTimes(1);
  });

  it('detaches a pending Promise response without clearing the next component check', async () => {
    const { fixture, component, check, requests } = setup();
    let resolve!: (value: unknown) => void;
    const response = new Promise((done) => (resolve = done));
    check.mockReturnValueOnce(response);
    component.checkForUpdates();
    fixture.destroy();
    expect(component.checkingForUpdates()).toBe(false);
    const nextFixture = TestBed.createComponent(GeneralComponent);
    nextFixture.detectChanges();
    nextFixture.componentInstance.checkForUpdates();
    resolve({});
    await response;
    expect(nextFixture.componentInstance.checkingForUpdates()).toBe(true);
    requests[0].next({});
    requests[0].complete();
    expect(nextFixture.componentInstance.checkingForUpdates()).toBe(false);
  });

  it('releases the pending state after synchronous completion', () => {
    const { component, check } = setup();
    check.mockReturnValue(of({}));
    component.checkForUpdates();
    expect(component.checkingForUpdates()).toBe(false);
    component.checkForUpdates();
    expect(check).toHaveBeenCalledTimes(2);
  });

  it('allows retry after an error without reporting an unhandled RxJS error', async () => {
    const { component, check } = setup();
    const previous = config.onUnhandledError;
    const unhandled = vi.fn();
    config.onUnhandledError = unhandled;
    try {
      check.mockReturnValueOnce(throwError(() => new Error('check failed')));
      component.checkForUpdates();
      expect(component.checkingForUpdates()).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
      component.checkForUpdates();
      expect(check).toHaveBeenCalledTimes(2);
    } finally {
      config.onUnhandledError = previous;
    }
  });
});
