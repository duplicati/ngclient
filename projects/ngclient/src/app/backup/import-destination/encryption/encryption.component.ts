import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipToggleCard } from '@ship-ui/core/ship-toggle-card';
import { finalize } from 'rxjs';
import { DuplicatiServer, SettingInputDto } from '../../../core/openapi';
import { OptionsListComponent } from '../../options/options-list/options-list.component';
import { ImportDestinationState } from '../import-destination.state';

const fb = new FormBuilder();

export const createEncryptionForm = () => {
  return fb.group({
    passphrase: fb.control<string>(''),
  });
};

@Component({
  selector: 'app-import-destination-encryption',
  imports: [ReactiveFormsModule, ShipFormField, ShipIcon, ShipButton, ShipToggleCard, OptionsListComponent],
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
  creatingTemporaryBackup = signal(false);
  settings = signal<SettingInputDto[]>([]);
  hasEncryptedBackup = computed(() => {
    const testSignal = this.#importDestinationState.destinationTestSignal();
    if (testSignal === 'testing' || typeof testSignal === 'string') return true;

    return testSignal?.containsEncryptedBackupFiles ?? true;
  });

  passphraseSignal = toSignal(this.encryptionForm.controls.passphrase.valueChanges);

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

  next() {
    const currentTargetUrl = this.#importDestinationState.destinationTargetUrl();
    if (!currentTargetUrl) {
      throw new Error('No target URL');
    }

    this.creatingTemporaryBackup.set(true);

    const pass = this.encryptionForm.value?.passphrase ?? null;

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

    this.#dupServer
      .postApiV1Backups({
        requestBody: {
          Backup: {
            TargetURL: currentTargetUrl,
            Settings: settings,
          },
        },
        temporary: true,
      })
      .pipe(finalize(() => this.creatingTemporaryBackup.set(false)))
      .subscribe({
        next: (backup) => {
          const id = backup.ID!;
          this.#importDestinationState.temporaryBackupId.set(id);
          this.#router.navigate([`../select-config`], { relativeTo: this.#route });
        },
        error: (err) => {
          console.error(err);
        },
      });
  }

  back() {
    this.#router.navigate(['../destination'], { relativeTo: this.#route });
  }
}
