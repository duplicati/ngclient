import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipFormFieldComponent } from '@ship-ui/core';
import { RemoteControlState } from './remote-control.state';

@Component({
  selector: 'app-remote-control',
  imports: [FormsModule, ShipFormFieldComponent],
  templateUrl: './remote-control.component.html',
  styleUrl: './remote-control.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RemoteControlComponent {
  #remoteControlState = inject(RemoteControlState);

  state = this.#remoteControlState.state;
  claimUrl = this.#remoteControlState.claimUrl;
  registerUrl = this.#remoteControlState.registerUrl;

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
}
