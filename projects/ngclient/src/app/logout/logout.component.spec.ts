import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppAuthState } from '../core/states/app-auth.state';
import LogoutComponent from './logout.component';

@Component({ template: '<p>Navigation target</p>' })
class TargetStub {}

describe('logout completion navigation', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup() {
    const isLoggingOut = signal(false);
    const logout = vi.fn(() => isLoggingOut.set(true));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'logout', component: LogoutComponent },
          { path: '', component: TargetStub },
        ]),
        { provide: AppAuthState, useValue: { isLoggingOut, logout } },
      ],
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/logout', LogoutComponent);
    return { harness, isLoggingOut, logout };
  }

  it('starts logout once and hides completion navigation while it is pending', async () => {
    const { harness, logout } = await setup();
    expect(harness.routeNativeElement!.textContent).toContain('Logging out...');
    expect(harness.routeNativeElement!.querySelector('a, button')).toBeNull();
    expect(logout).toHaveBeenCalledOnce();
  });

  it('offers a native link to the existing home target after logout completes', async () => {
    const { harness, isLoggingOut, logout } = await setup();
    isLoggingOut.set(false);
    harness.detectChanges();
    const link = harness.routeNativeElement!.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/');
    expect(link.textContent).toContain('Go to login page');
    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(logout).toHaveBeenCalledOnce();
  });

  it('leaves modified completion-link clicks to the browser without logging out again', async () => {
    const { harness, isLoggingOut, logout } = await setup();
    isLoggingOut.set(false);
    harness.detectChanges();
    const link = harness.routeNativeElement!.querySelector('a') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    let prevented: boolean | undefined;
    link.addEventListener('click', (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // jsdom cannot open another document.
    });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(prevented).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/logout');
    expect(logout).toHaveBeenCalledOnce();
  });
});
