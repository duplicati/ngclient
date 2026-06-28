import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipDialog } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { RemoteControlState } from '../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../settings/server-settings.service';

@Component({
  selector: 'app-select',
  imports: [ShipButton, ShipCheckbox, ShipDialog, ShipIcon, ShipTooltip],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Select {
  #serverSettingsService = inject(ServerSettingsService);
  #router = inject(Router);
  #remoteControl = inject(RemoteControlState);

  hoveringConnect = signal(false);
  skipDialogOpen = signal(false);
  hasConnectionLink = signal(false);

  primaryBenefits = [
    $localize`Zero-configuration cloud storage`,
    $localize`Centralized backup reporting and monitoring`,
    $localize`Remote management from the dashboard`,
    $localize`Notifcations if backups stop running`,
  ];

  secondaryBenefits = [
    $localize`Get notified if your backups stop working`,
    $localize`Access AI powered troubleshooting`,
    $localize`View all backups from one place`,
  ];

  #onConnectEvent = effect(() => {
    const state = this.#remoteControl.state();
    if (state == 'unknown' || state == 'inactive') return;

    // If we connect while showing the dialog, dismiss it
    this.setWelcomeShown();
  });

  setWelcomeShown() {
    this.#serverSettingsService.setShownWelcomePage().subscribe(() => {
      this.#router.navigate(['']);
    });
  }

  openSkipDialog() {
    this.skipDialogOpen.set(true);
  }

  connect() {
    const route = this.hasConnectionLink() ? '/welcome/connect/link' : '/welcome/connect/logon';
    this.#router.navigate([route]);
  }
}
