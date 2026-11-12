import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipToggleCard } from '@ship-ui/core/ship-toggle-card';
import { defer, map } from 'rxjs';
import { DuplicatiServer, SettingInputDto } from '../../../core/openapi';
import { AsyncOperation } from '../../../core/signals/async-operation';
import { OptionsListComponent } from '../../options/options-list/options-list.component';
import { ImportDestinationState } from '../import-destination.state';
import { NullableTextControl } from '../../general/nullable-text-control';

@Component({
  selector: 'app-import-destination-encryption',
  imports: [FormField, NullableTextControl, ShipFormField, ShipIcon, ShipButton, ShipToggleCard, OptionsListComponent],
  templateUrl: './encryption.component.html',
  styleUrl: './encryption.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class EncryptionComponent {
  #dupServer = inject(DuplicatiServer);
  #importDestinationState = inject(ImportDestinationState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  encryptionForm = this.#importDestinationState.encryptionForm;
  #preparation = new AsyncOperation<string>();
  preparationState = this.#preparation.state;
  creatingTemporaryBackup = this.#preparation.pending;
  settings = signal<SettingInputDto[]>([]);
  hasEncryptedBackup = computed(() => {
    const testSignal = this.#importDestinationState.destinationTestSignal();
    if (testSignal === 'testing' || typeof testSignal === 'string') return true;

    return testSignal?.containsEncryptedBackupFiles ?? true;
  });

  passphraseSignal = this.encryptionForm.passphrase().value;

  showEncryptionField = signal(false);
  isValidConfig = computed(() => {
    const hasTargetUrl = this.#importDestinationState.destinationTargetUrl();
    if (!hasTargetUrl) return false;

    const testSignal = this.#importDestinationState.destinationTestSignal();
    const hasEncryptedBackup = typeof testSignal !== 'string' && (testSignal?.containsEncryptedBackupFiles ?? false);
    if (hasEncryptedBackup) {
      const pass = this.passphraseSignal();
      if (!pass) return false;
    }

    return true;
  });

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#preparation.destroy());
  }

  next() {
    if (this.creatingTemporaryBackup() || !this.isValidConfig()) return;
    const currentTargetUrl = this.#importDestinationState.destinationTargetUrl();
    if (!currentTargetUrl) return;

    const pass = this.encryptionForm.passphrase().value();

    let settings: SettingInputDto[] = [];

    if (pass) {
      settings.push({ Name: '--passphrase', Value: pass });
    } else {
      settings.push({ Name: '--no-encryption', Value: 'true' });
    }

    this.settings().forEach((setting) => {
      let name = setting.Name?.trim();
      if (name && name !== '--') {
        if (!name.startsWith('--')) {
          name = `--${name}`;
        }
        settings.push({ Name: name, Value: setting.Value ?? '' });
      }
    });

    this.#preparation.run(
      () =>
        defer(() =>
          this.#dupServer.postApiV1Backups({
            body: {
              Backup: {
                TargetURL: currentTargetUrl,
                Settings: settings,
              },
            },
            query: { temporary: true },
          })
        ).pipe(
          map((backup) => {
            if (!backup.ID) throw new Error('The temporary backup response has no ID');
            return backup.ID;
          })
        ),
      (id) => {
        this.#importDestinationState.temporaryBackupId.set(id);
        this.#router.navigate(['../select-config'], { relativeTo: this.#route });
      }
    );
  }

  back() {
    this.#preparation.cancel();
    this.#router.navigate(['../destination'], { relativeTo: this.#route });
  }
}
