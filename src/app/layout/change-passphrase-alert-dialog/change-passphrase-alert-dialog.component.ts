import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  SparkleAlertComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleTooltipDirective,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';

@Component({
  selector: 'app-change-passphrase-alert-dialog',
  imports: [
    FormsModule,
    SparkleAlertComponent,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleTooltipDirective,
  ],
  templateUrl: './change-passphrase-alert-dialog.component.html',
  styleUrl: './change-passphrase-alert-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassphraseAlertDialogComponent {
  #dupServer = inject(DuplicatiServerService);
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
