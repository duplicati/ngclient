import { inject, Injectable, signal } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core';
import { TestState } from '../../backup/source-data/target-url-dialog/test-url/test-url';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { createEncryptionForm } from './encryption/encryption.component';

@Injectable({
  providedIn: 'root',
})
export class ImportDestinationState {
  #dialog = inject(ShipDialogService);

  destinationTargetUrl = signal<string | null>(null);
  destinationTestSignal = signal<TestState>(null);
  encryptionForm = createEncryptionForm();

  // The temporary backup ID once created
  temporaryBackupId = signal<string | null>(null);

  updateTargetUrl(targetUrl: string | null) {
    this.destinationTargetUrl.set(targetUrl);
  }

  showErrorDialog(message: string) {
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Error occured`,
        message: message,
        confirmText: $localize`OK`,
        cancelText: undefined,
      },
      closed: (_) => {},
    });
  }
}
