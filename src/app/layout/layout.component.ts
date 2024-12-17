import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleDividerComponent,
  SparkleIconComponent,
  SparkleListComponent,
  SparkleSidenavComponent,
} from '@sparkle-ui/core';
import LogoComponent from '../core/components/logo/logo.component';
import ServiceHubComponent from '../core/components/service-hub/service-hub.component';
import { BackupsState } from '../core/states/backups.state';
import { RelayconfigState } from '../core/states/relayconfig.state';
import { LayoutState } from './layout.state';

@Component({
  selector: 'app-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    SparkleSidenavComponent,
    SparkleIconComponent,
    SparkleListComponent,
    SparkleButtonComponent,
    SparkleDividerComponent,
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

  relayIsEnabled = this.#relayConfigState.relayIsEnabled;
  isDarkMode = this.#layoutState.isDarkMode;

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  toggleBodyClass() {
    this.#layoutState.toggleBodyClass();
  }

  changeDefaultClientTo(client: 'ngclient' | 'ngax') {
    this.#setClientDefault(client);
    window.location.replace(`/${client}`);
  }

  #setClientDefault(client: 'ngclient' | 'ngax') {
    var d = new Date();
    d.setTime(d.getTime() + 90 * 24 * 60 * 60 * 1000);

    document.cookie = 'default-theme=' + client + '; expires=' + d.toUTCString() + '; path=/';
  }
}
