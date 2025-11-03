import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RemoteControlState } from '../../../../settings/remote-control/remote-control.state';

@Component({
  selector: 'app-remote-connectivity-status',
  imports: [RouterLink],
  templateUrl: './remote-connectivity-status.html',
  styleUrl: './remote-connectivity-status.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RemoteConnectivityStatus {
  #remoteControlState = inject(RemoteControlState);

  state = this.#remoteControlState.state;

  ngOnInit() {
    this.#remoteControlState.refreshRemoteControlStatus();
  }

  claim() {
    const claimUrl = this.#remoteControlState.claimUrl();

    if (claimUrl) {
      window.open(claimUrl, '_blank');
    }
  }

  resetAndRetry() {
    this.#remoteControlState.cancelRemoteRegistration();
    this.#remoteControlState.beginRemoteRegistration();
  }
}
