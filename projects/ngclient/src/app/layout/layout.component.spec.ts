import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it } from 'vitest';
import ServiceHubComponent from '../core/components/service-hub/service-hub.component';
import { AppAuthState } from '../core/states/app-auth.state';
import { BackupsState } from '../core/states/backups.state';
import { IdleLogoutState } from '../core/states/idle-logout.state';
import { RelayconfigState } from '../core/states/relayconfig.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { NotificationsState } from '../notifications/notifications.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import LayoutComponent from './layout.component';
import { LayoutState } from './layout.state';

// Render the real sidenav template to check the external help links it offers.
describe('LayoutComponent sidenav links', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup() {
    TestBed.configureTestingModule({
      imports: [LayoutComponent],
      providers: [
        provideRouter([]),
        {
          provide: LayoutState,
          useValue: {
            isDarkMode: signal(false),
            isNavOpen: signal(true),
            sidenavType: signal('simple'),
            toggleBodyClass: () => {},
            loadServerTheme: () => {},
          },
        },
        { provide: BackupsState, useValue: { getBackups: () => {} } },
        { provide: RelayconfigState, useValue: { relayIsEnabled: signal(false) } },
        { provide: ShipDialogService, useValue: { open: () => {} } },
        { provide: NotificationsState, useValue: { init: () => {} } },
        { provide: AppAuthState, useValue: { logout: () => {} } },
        { provide: IdleLogoutState, useValue: { watch: () => {} } },
        {
          provide: ServerSettingsService,
          useValue: {
            serverSettings: signal(undefined),
            askForInitialPasswordConfig: signal(false),
            showWelcomePage: signal(false),
            setShownWelcomePage: () => {},
          },
        },
        {
          provide: SysinfoState,
          useValue: { allOptions: signal([]), systemInfo: signal({ MachineName: 'test-machine' }) },
        },
        { provide: RemoteControlState, useValue: { state: signal('unknown') } },
      ],
    });
    // The service hub pulls in its own server states; it is not part of the sidenav links.
    TestBed.overrideComponent(LayoutComponent, {
      remove: { imports: [ServiceHubComponent] },
      add: { schemas: [NO_ERRORS_SCHEMA] },
    });
    const fixture = TestBed.createComponent(LayoutComponent);
    fixture.detectChanges();
    return { fixture };
  }

  function links(fixture: ReturnType<typeof setup>['fixture']) {
    return Array.from(fixture.nativeElement.querySelectorAll('a[href]') as NodeListOf<HTMLAnchorElement>);
  }

  it('links to the GitHub issue chooser in a new tab', () => {
    const { fixture } = setup();
    const report = links(fixture).find((a) => a.textContent?.includes('Report an issue'));
    expect(report).toBeDefined();
    expect(report!.getAttribute('href')).toBe('https://github.com/duplicati/duplicati/issues/new/choose');
    expect(report!.getAttribute('target')).toBe('_blank');
  });

  it('keeps the documentation and forum links', () => {
    const { fixture } = setup();
    const hrefs = links(fixture).map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://docs.duplicati.com');
    expect(hrefs).toContain('https://forum.duplicati.com');
  });
});
