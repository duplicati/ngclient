import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipButton, ShipButtonGroup, ShipIcon, ShipMenu } from '@ship-ui/core';
import { LogsLiveState } from './logs-live/logs-live.state';

@Component({
  selector: 'app-logs',
  imports: [ShipButton, ShipButtonGroup, ShipIcon, ShipMenu, RouterOutlet, RouterLinkActive, RouterLink],
  templateUrl: './logs.component.html',
  styleUrl: './logs.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogsComponent {
  #router = inject(Router);
  #logsLiveState = inject(LogsLiveState);

  logLevel = this.#logsLiveState.logLevel;
  logLevelByLabel = this.#logsLiveState.logLevelByLabel;
  currentUrl = signal(this.#router.url);

  constructor() {
    this.#router.events.subscribe((event) => {
      if (event instanceof NavigationEnd) {
        this.currentUrl.set(event.urlAfterRedirects);
      }
    });
  }

  updateLogLevel(logLevel: string) {
    this.#logsLiveState.isPolling.set(true);
    this.#logsLiveState.updateLogLevel(logLevel);
  }
}
