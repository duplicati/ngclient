import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { config, ObservableInput, of, Subject, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, ServerStatusDto, SystemInfoDto } from '../../core/openapi';
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
          useValue: {
            installSupported: () => false,
            canCancel: () => false,
            installing: () => false,
            unsupportedReason: () => null,
          },
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

  describe('result of a check started from the page', () => {
    function start(initial: Partial<ServerStatusDto>) {
      const context = setup();
      context.serverState.set({ UpdaterState: 'Waiting', ...initial });
      context.fixture.detectChanges();
      (context.fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
      context.requests[0].next({});
      context.requests[0].complete();
      context.fixture.detectChanges();
      const result = () =>
        (
          context.fixture.nativeElement.querySelector('.update-check-result') as HTMLElement | null
        )?.textContent?.trim();
      const finish = (state: Partial<ServerStatusDto>) => {
        context.serverState.set({ UpdaterState: 'Waiting', ...state });
        context.fixture.detectChanges();
      };
      return { ...context, result, finish };
    }

    it('shows why the check failed once the server reports that it finished', () => {
      const { result, finish, serverState, fixture } = start({
        UpdateCheckFinished: '2026-11-19T01:00:00Z',
        UpdateCheckError: 'An earlier failure',
      });
      expect(result()).toBeUndefined();
      serverState.set({ UpdaterState: 'Checking', UpdateCheckFinished: '2026-11-19T01:00:00Z' });
      fixture.detectChanges();
      expect(result()).toBeUndefined();
      finish({ UpdateCheckFinished: '2026-11-19T02:00:00Z', UpdateCheckError: 'Connection refused' });
      expect(result()).toBe('Could not check for updates: Connection refused');
    });

    it('tells a second failure from the first by the finish time, without seeing the checking state', () => {
      const { result, finish } = start({ UpdateCheckFinished: '2026-11-19T01:00:00Z', UpdateCheckError: 'Timeout' });
      finish({ UpdateCheckFinished: '2026-11-19T01:00:00Z', UpdateCheckError: 'Timeout' });
      expect(result()).toBeUndefined();
      finish({ UpdateCheckFinished: '2026-11-19T02:00:00Z', UpdateCheckError: 'Timeout' });
      expect(result()).toBe('Could not check for updates: Timeout');
    });

    it('says the version is the latest when the first check finds no update', () => {
      const { result, finish } = start({});
      finish({ UpdateCheckFinished: '2026-11-19T02:00:00Z', UpdateCheckError: null });
      expect(result()).toBe('You are running the latest version');
    });

    it('shows no result when the check found an update, as the update is offered instead', () => {
      const { result, finish } = start({});
      finish({ UpdateCheckFinished: '2026-11-19T02:00:00Z', UpdatedVersion: '2.3.0.0' });
      expect(result()).toBeUndefined();
    });

    it('shows no result from a server that does not report the finish time', () => {
      const { result, finish } = start({});
      finish({ UpdatedVersion: null });
      expect(result()).toBeUndefined();
    });

    it('shows no result for a check that was not started from the page', () => {
      const { fixture, serverState } = setup();
      serverState.set({
        UpdaterState: 'Waiting',
        UpdateCheckFinished: '2026-11-19T02:00:00Z',
        UpdateCheckError: 'Timeout',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.update-check-result')).toBeNull();
    });

    it('does not take a later check as the result of a request that failed', () => {
      const { fixture, requests, serverState } = setup();
      (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
      requests[0].error(new Error('refused'));
      serverState.set({
        UpdaterState: 'Waiting',
        UpdateCheckFinished: '2026-11-19T02:00:00Z',
        UpdateCheckError: 'Timeout',
      });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.update-check-result')).toBeNull();
    });
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

// The server reports these in the system info (issue duplicati/duplicati#6611); the real state loads them.
describe('GeneralComponent database encryption and preload settings', () => {
  afterEach(() => TestBed.resetTestingModule());

  function render(systemInfo: Partial<SystemInfoDto>) {
    TestBed.configureTestingModule({
      imports: [GeneralComponent],
      providers: [
        SysinfoState,
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1Systeminfo: () => of(systemInfo),
            getApiV1Acknowledgements: () => new Subject<{ Acknowledgements: string }>(),
          },
        },
        { provide: ServerStateService, useValue: { serverState: signal<Partial<ServerStatusDto>>({}) } },
        {
          provide: UpdateInstallService,
          useValue: { installSupported: () => false, canCancel: () => false, installing: () => false },
        },
      ],
    });
    TestBed.inject(SysinfoState).preload();
    const fixture = TestBed.createComponent(GeneralComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('says the database is encrypted and lists the preload paths with which are found', () => {
    const element = render({
      DatabaseFieldsEncrypted: true,
      PreloadSettingsPaths: [
        { Path: '/data/preload.json', Exists: false },
        { Path: '/opt/duplicati/preload.json', Exists: true },
      ],
    });
    expect(element.querySelector('.database-encryption')?.textContent).toContain('The server database is encrypted.');
    const items = Array.from(element.querySelectorAll('.preload-paths li')).map((x) => [
      x.querySelector('code')?.textContent,
      x.querySelector('span')?.textContent?.trim(),
    ]);
    expect(items).toEqual([
      ['/data/preload.json', '(not found)'],
      ['/opt/duplicati/preload.json', '(found)'],
    ]);
  });

  it('says the database is not encrypted', () => {
    const element = render({ DatabaseFieldsEncrypted: false, PreloadSettingsPaths: [] });
    expect(element.querySelector('.database-encryption')?.textContent).toContain(
      'The server database is not encrypted.'
    );
    expect(element.querySelector('.preload-paths')).toBeNull();
  });

  it('shows neither for a server that does not report them', () => {
    const element = render({ ServerVersionName: 'Old server' });
    expect(element.querySelector('.database-encryption')).toBeNull();
    expect(element.querySelector('.preload-paths')).toBeNull();
  });
});
