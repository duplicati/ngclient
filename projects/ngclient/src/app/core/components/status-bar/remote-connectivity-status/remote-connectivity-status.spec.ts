import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteControlState } from '../../../../settings/remote-control/remote-control.state';
import RemoteConnectivityStatus from './remote-connectivity-status';

type State = ReturnType<RemoteControlState['state']>;

describe('RemoteConnectivityStatus navigation and commands', () => {
  let fixture: ComponentFixture<RemoteConnectivityStatus>;
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(initial: State) {
    const remote = {
      state: signal<State>(initial),
      claimUrl: signal('https://example.invalid/claim'),
      refreshRemoteControlStatus: vi.fn(),
      cancelRemoteRegistration: vi.fn(),
      beginRemoteRegistration: vi.fn(),
      openConsole: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [RemoteConnectivityStatus],
      providers: [provideRouter([]), { provide: RemoteControlState, useValue: remote }],
    });
    fixture = TestBed.createComponent(RemoteConnectivityStatus);
    fixture.detectChanges();
    return remote;
  }

  function root(): HTMLElement {
    return fixture.nativeElement;
  }

  it.each(['unknown', 'inactive', 'registering'] as const)('provides a native registration link in %s', (state) => {
    const remote = setup(state);
    const link = root().querySelector<HTMLAnchorElement>('a.connectivity-status');
    expect(link?.getAttribute('href')).toBe('/connect/logon');
    expect(link?.textContent).toContain(state === 'registering' ? 'Connecting' : 'Click to register');
    expect(link?.hasAttribute('appKeyboardAction')).toBe(false);
    expect(remote.refreshRemoteControlStatus).toHaveBeenCalledOnce();
    expect(remote.cancelRemoteRegistration).not.toHaveBeenCalled();
    expect(remote.beginRemoteRegistration).not.toHaveBeenCalled();
  });

  it('preserves retry and re-registration after a failed registration', () => {
    const remote = setup('registeringfaulted');
    const retry = root().querySelector<HTMLElement>('.connectivity-status')!;
    expect(retry.tagName).toBe('DIV');
    expect(root().querySelector('a')).toBeNull();
    retry.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(remote.cancelRemoteRegistration).toHaveBeenCalledOnce();
    expect(fixture.componentInstance.resetting()).toBe(true);
    expect(root().textContent).toContain('Resetting');
    remote.state.set('registered');
    fixture.detectChanges();
    TestBed.tick();
    expect(fixture.componentInstance.resetting()).toBe(false);
    expect(remote.beginRemoteRegistration).toHaveBeenCalledOnce();
  });

  it.each(['connected', 'connecting', 'disabled'] as const)('preserves the console command in %s', (state) => {
    const remote = setup(state);
    const command = root().querySelector<HTMLElement>('.connectivity-status')!;
    expect(command.tagName).toBe('DIV');
    expect(root().querySelector('a')).toBeNull();
    command.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(remote.openConsole).not.toHaveBeenCalled();
    command.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(remote.openConsole).toHaveBeenCalledOnce();
  });

  it('preserves claim and cancel commands for a registered machine', () => {
    const remote = setup('registered');
    const open = vi.spyOn(window, 'open').mockReturnValue(null);
    root()
      .querySelector<HTMLElement>('div.claim > div.claim')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.invalid/claim', '_blank');
    root()
      .querySelector<HTMLElement>('sh-icon[aria-label="Cancel registration"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(remote.cancelRemoteRegistration).toHaveBeenCalledOnce();
    expect(root().querySelector('a')).toBeNull();
  });
  it.each([
    'unknown',
    'inactive',
    'registering',
    'registeringfaulted',
    'registered',
    'connected',
    'connecting',
    'disabled',
  ] as const)('renders a non-interactive status indicator in %s inside the mobile menu trigger', (state) => {
    const remote = setup(state);
    fixture.componentRef.setInput('indicatorOnly', true);
    fixture.detectChanges();
    const dot = root().querySelector<HTMLElement>('.status')!;
    expect(dot.tagName).toBe('SPAN');
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    expect(root().querySelector('a, button, [tabindex], [appKeyboardAction]')).toBeNull();
    expect(dot.classList.contains('warning')).toBe(state === 'registering');
    expect(dot.classList.contains('success')).toBe(
      ['registered', 'connected', 'connecting', 'disabled'].includes(state)
    );
    expect(dot.classList.contains('blinking')).toBe(['registering', 'registered'].includes(state));
    expect(remote.cancelRemoteRegistration).not.toHaveBeenCalled();
    expect(remote.openConsole).not.toHaveBeenCalled();
  });
});
