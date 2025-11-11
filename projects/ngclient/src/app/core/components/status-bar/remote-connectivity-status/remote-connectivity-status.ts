import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipIcon, ShipTooltip } from '@ship-ui/core';
import { RemoteControlState } from '../../../../settings/remote-control/remote-control.state';

@Component({
  selector: 'app-remote-connectivity-status',
  imports: [RouterLink, ShipIcon, ShipTooltip],
  templateUrl: './remote-connectivity-status.html',
  styleUrl: './remote-connectivity-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RemoteConnectivityStatus {
  #remoteControlState = inject(RemoteControlState);

  state = this.#remoteControlState.state;
  resetting = signal(false);

  stateEffect = effect(() => {
    const state = this.#remoteControlState.state();
    const currentResetState = this.resetting();

    if (state === 'registered' && currentResetState) {
      this.resetting.set(false);

      this.#remoteControlState.beginRemoteRegistration();
    }
  });

  ngOnInit() {
    this.#remoteControlState.refreshRemoteControlStatus();
  }

  claim() {
    const claimUrl = this.#remoteControlState.claimUrl();

    if (claimUrl) {
      window.open(claimUrl, '_blank');
    }
  }

  cancel() {
    this.#remoteControlState.cancelRemoteRegistration();
  }

  resetAndRetry() {
    this.resetting.set(true);
    this.#remoteControlState.cancelRemoteRegistration();
  }
}
