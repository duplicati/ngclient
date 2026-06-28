import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { finalize } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';

@Component({
  selector: 'app-change-passphrase-alert-dialog',
  imports: [FormsModule, ShipAlert, ShipFormField, ShipIcon, ShipTooltip, ShipButton],
  templateUrl: './change-passphrase-alert-dialog.component.html',
  styleUrl: './change-passphrase-alert-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassphraseAlertDialogComponent {
  #dupServer = inject(DuplicatiServer);
  closed = output();

  isUpdating = signal(false);
  passphrase = signal('');
  repeatPassphrase = signal('');

  updatePassphrase() {
    if (this.passphrase() !== this.repeatPassphrase()) return;

    this.isUpdating.set(true);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'server-passphrase': this.passphrase(),
        },
      })
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe({
        next: () => this.closed.emit(),
      });
  }

  cancel() {
    this.isUpdating.set(true);

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'has-asked-for-password-change': 'True',
        },
      })
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe({
        next: () => this.closed.emit(),
      });
  }
}
