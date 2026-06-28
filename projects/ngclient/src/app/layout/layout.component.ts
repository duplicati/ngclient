import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipList } from '@ship-ui/core/ship-list';
import { ShipSidenav } from '@ship-ui/core/ship-sidenav';
import LogoComponent from '../core/components/logo/logo.component';
import ServiceHubComponent from '../core/components/service-hub/service-hub.component';
import { AppAuthState } from '../core/states/app-auth.state';
import { BackupsState } from '../core/states/backups.state';
import { RelayconfigState } from '../core/states/relayconfig.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { NotificationsState } from '../notifications/notifications.state';
import { RemoteControlState } from '../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { ChangePassphraseAlertDialogComponent } from './change-passphrase-alert-dialog/change-passphrase-alert-dialog.component';
import { LayoutState } from './layout.state';

@Component({
  selector: 'app-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    ShipSidenav,
    ShipIcon,
    ShipList,
    ShipButton,
    ShipDivider,
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

  relayIsEnabled = this.#relayConfigState.relayIsEnabled;
  isDarkMode = this.#layoutState.isDarkMode;
  isNavOpen = this.#layoutState.isNavOpen;
  sidenavType = this.#layoutState.sidenavType;
  hasShownPasswordDialog = false;

  machineName = computed(() => {
    const serverSettings = this.#serverSettingsState.serverSettings();
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

  toggleBodyClass() {
    this.#layoutState.toggleBodyClass();
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
