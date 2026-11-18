import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipList } from '@ship-ui/core/ship-list';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipSidenav } from '@ship-ui/core/ship-sidenav';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import LogoComponent from '../core/components/logo/logo.component';
import ServiceHubComponent from '../core/components/service-hub/service-hub.component';
import { GetApiV1ServersettingsResponse } from '../core/openapi';
import { AppAuthState } from '../core/states/app-auth.state';
import { BackupsState } from '../core/states/backups.state';
import { IdleLogoutState } from '../core/states/idle-logout.state';
import { RelayconfigState } from '../core/states/relayconfig.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { NotificationsState } from '../notifications/notifications.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { ChangePassphraseAlertDialogComponent } from './change-passphrase-alert-dialog/change-passphrase-alert-dialog.component';
import { LayoutState, THEME_OPTIONS, ThemeMode } from './layout.state';

@Component({
  selector: 'app-layout',
  imports: [
    NgTemplateOutlet,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ShipSidenav,
    ShipIcon,
    ShipList,
    ShipMenu,
    ShipButton,
    ShipDivider,
    ShipTooltip,
    ServiceHubComponent,
    LogoComponent,
  ],
  templateUrl: './layout.component.html',
  styleUrl: './layout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LayoutComponent {
  #layoutState = inject(LayoutState);
  #backupsState = inject(BackupsState);
  #relayConfigState = inject(RelayconfigState);
  #dialog = inject(ShipDialogService);
  #notificationState = inject(NotificationsState);
  #auth = inject(AppAuthState);
  #serverSettingsState = inject(ServerSettingsService);
  #sysInfoState = inject(SysinfoState);
  #router = inject(Router);
  #remoteControl = inject(RemoteControlState);
  #idleLogout = inject(IdleLogoutState);
  #destroyRef = inject(DestroyRef);

  relayIsEnabled = this.#relayConfigState.relayIsEnabled;
  themeMode = this.#layoutState.themeMode;
  themeOptions = THEME_OPTIONS;
  currentTheme = computed(() => THEME_OPTIONS.find((option) => option.value === this.themeMode()) ?? THEME_OPTIONS[0]);
  themeMenuLabel = computed(() => $localize`Theme: ${this.currentTheme().label}`);
  isNavOpen = this.#layoutState.isNavOpen;
  sidenavType = this.#layoutState.sidenavType;
  hasShownPasswordDialog = false;

  machineName = computed(() => {
    const serverSettings = this.#serverSettingsState.serverSettings() as GetApiV1ServersettingsResponse | undefined;
    if (serverSettings && serverSettings['--machine-name']) {
      return serverSettings['--machine-name'];
    }

    if (serverSettings && serverSettings['machine-name']) {
      return serverSettings['machine-name'];
    }

    const sysinfo = this.#sysInfoState.allOptions().find((s) => s.name === 'machine-name');
    if (sysinfo && sysinfo.defaultValue) {
      return sysinfo.defaultValue;
    }

    return this.#sysInfoState.systemInfo()?.MachineName ?? 'Unknown';
  });

  ngOnInit() {
    this.#notificationState.init();
    this.#backupsState.getBackups(true);
    this.#idleLogout.watch(this.#destroyRef);
    this.#layoutState.loadServerTheme();
  }

  serverSettingsEffect = effect(() => {
    if (this.hasShownPasswordDialog) return;
    if (this.#serverSettingsState.askForInitialPasswordConfig()) {
      this.hasShownPasswordDialog = true;
      this.#dialog.open(ChangePassphraseAlertDialogComponent, {
        maxWidth: '500px',
      });
    }

    if (this.#serverSettingsState.showWelcomePage()) {
      const state = this.#remoteControl.state();
      // If we are not connected, show welcome page
      if (state == 'inactive') this.#router.navigate(['/welcome']);
      // If we are some other state, don't show welcome later
      else if (state != 'unknown') this.#serverSettingsState.setShownWelcomePage();
    }
  });

  setThemeMode(mode: ThemeMode) {
    this.#layoutState.setThemeMode(mode);
  }

  changeDefaultClientTo(client: 'ngclient' | 'ngax') {
    this.#setClientDefault(client);
    window.location.replace(`/${client}`);
  }

  logout() {
    this.#auth.logout();
  }

  #setClientDefault(client: 'ngclient' | 'ngax') {
    var d = new Date();
    d.setTime(d.getTime() + 90 * 24 * 60 * 60 * 1000);

    document.cookie = 'default-client=' + client + '; expires=' + d.toUTCString() + '; path=/';
  }
}
