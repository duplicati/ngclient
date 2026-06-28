import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipChip } from '@ship-ui/core/ship-chip';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ServerSettingsService } from '../server-settings.service';
import { RemoteControlState } from './remote-control.state';

@Component({
  selector: 'app-remote-control',
  imports: [FormsModule, ShipFormField, ShipButton, ShipChip, ShipIcon],
  templateUrl: './remote-control.component.html',
  styleUrl: './remote-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteControlComponent {
  #remoteControlState = inject(RemoteControlState);
  #serverSettingsService = inject(ServerSettingsService);

  state = this.#remoteControlState.state;
  claimUrl = this.#remoteControlState.claimUrl;
  registerUrl = this.#remoteControlState.registerUrl;
  additionalReportingUrl = computed(() => {
    const settings = this.#serverSettingsService.serverSettings();
    return settings ? settings['additional-report-url'] || '' : '';
  });

  copiedReportingUrl = signal(false);

  ngOnInit() {
    this.#remoteControlState.refreshRemoteControlStatus();
  }

  cancel() {
    this.#remoteControlState.cancelRemoteRegistration();
  }

  register() {
    this.#remoteControlState.beginRemoteRegistration();
  }

  disable() {
    this.#remoteControlState.disableRemoteControl();
  }

  enable() {
    this.#remoteControlState.enableRemoteControl();
  }

  delete() {
    this.#remoteControlState.deleteRemoteControl();
  }

  copyReportingUrl() {
    const url = this.additionalReportingUrl();
    if (url) {
      this.copiedReportingUrl.set(true);
      setTimeout(() => this.copiedReportingUrl.set(false), 2000);
      navigator.clipboard.writeText(url);
    }
  }
}
