import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { disabled, form, FormField } from '@angular/forms/signals';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { defer, finalize } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { AppAuthState } from '../../core/states/app-auth.state';

@Component({
  selector: 'app-change-passphrase-alert-dialog',
  imports: [FormField, ShipAlert, ShipFormField, ShipIcon, ShipTooltip, ShipButton],
  templateUrl: './change-passphrase-alert-dialog.component.html',
  styleUrl: './change-passphrase-alert-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassphraseAlertDialogComponent {
  #dupServer = inject(DuplicatiServer);
  #auth = inject(AppAuthState);
  closed = output();

  isUpdating = signal(false);
  passphraseForm = form(signal({ passphrase: '', repeatPassphrase: '' }), (path) => {
    disabled(path.repeatPassphrase, ({ valueOf }) => valueOf(path.passphrase).length === 0);
  });
  passphrase = this.passphraseForm.passphrase().value;
  repeatPassphrase = this.passphraseForm.repeatPassphrase().value;

  updatePassphrase() {
    if (this.passphrase() !== this.repeatPassphrase()) return;

    this.isUpdating.set(true);

    defer(() =>
      this.#dupServer.patchApiV1Serversettings({
        body: {
          'server-passphrase': this.passphrase(),
        },
      })
    )
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe({
        next: () => {
          this.closed.emit();
          // The server has revoked all tokens, including the one this session uses
          this.#auth.signOutAfterPassphraseChange();
        },
      });
  }

  cancel() {
    this.isUpdating.set(true);

    defer(() =>
      this.#dupServer.patchApiV1Serversettings({
        body: {
          'has-asked-for-password-change': 'True',
        },
      })
    )
      .pipe(finalize(() => this.isUpdating.set(false)))
      .subscribe({
        next: () => this.closed.emit(),
      });
  }
}
