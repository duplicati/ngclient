import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ShipButton, ShipDivider } from '@ship-ui/core';
import { ServerSettingsService } from '../../settings/server-settings.service';

@Component({
  selector: 'app-select',
  imports: [RouterLink, ShipDivider, ShipButton],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Select {
  #serverSettingsService = inject(ServerSettingsService);
  #router = inject(Router);
  hoveringConnect = signal(false);

  setWelcomeShown() {
    this.#serverSettingsService.setShownWelcomePage().subscribe(() => {
      this.#router.navigate(['']);
    });
  }
}
