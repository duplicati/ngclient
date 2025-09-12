import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButtonComponent, ShipFormFieldComponent, ShipIconComponent } from '@ship-ui/core';
import { finalize } from 'rxjs';
import { OptionsListComponent } from '../../backup/options/options-list/options-list.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { DuplicatiServer, SettingInputDto } from '../../core/openapi';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createEncryptionForm = () => {
  return fb.group({
    passphrase: fb.control<string>(''),
  });
};

@Component({
  selector: 'app-restore-encryption',
  imports: [
    ReactiveFormsModule,
    ShipFormFieldComponent,
    ShipIconComponent,
    ShipButtonComponent,
    ToggleCardComponent,
    OptionsListComponent,
  ],
  templateUrl: './restore-encryption.component.html',
  styleUrl: './restore-encryption.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreEncryptionComponent {
  #dupServer = inject(DuplicatiServer);
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  encryptionForm = this.#restoreFlowState.encryptionForm;
  creatingTemporaryBackup = signal(false);
  settings = signal<SettingInputDto[]>([]);

  next() {
    const currentTargetUrl = this.#restoreFlowState.destinationTargetUrl();
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

          this.#router.navigate([`/restore-draft/${id}`]);
        },
        error: (err) => {
          console.error(err);
        },
      });
  }

  back() {
    if (this.#restoreFlowState.isFileRestore()) {
      this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
    } else {
      this.#restoreFlowState.exit();
    }
  }
}
