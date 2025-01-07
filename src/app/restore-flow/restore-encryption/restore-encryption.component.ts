import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createEncryptionForm = () => {
  return fb.group({
    passphrase: fb.control<string>(''),
  });
};

@Component({
  selector: 'app-restore-encryption',
  imports: [ReactiveFormsModule, SparkleFormFieldComponent, SparkleIconComponent, SparkleButtonComponent],
  templateUrl: './restore-encryption.component.html',
  styleUrl: './restore-encryption.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreEncryptionComponent {
  #dupServer = inject(DuplicatiServerService);
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  encryptionForm = this.#restoreFlowState.encryptionForm;
  creatingTemporaryBackup = signal(false);

  next() {
    const currentTargetUrl = this.#restoreFlowState.destinationTargetUrl();
    if (!currentTargetUrl) {
      throw new Error('No target URL');
    }

    this.creatingTemporaryBackup.set(true);

    const pass = this.encryptionForm.value?.passphrase ?? null;

    let settings = [{ Name: '--no-encryption', Value: 'true' }];

    if (pass) {
      settings = [{ Name: '--passphrase', Value: pass }];
    }

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

          this.#restoreFlowState.getBackup(id);
          this.#router.navigate([`/restore-draft/${id}`]);
        },
        error: (err) => {
          console.error(err);
        },
      });
  }

  back() {
    if (this.#restoreFlowState.isFileRestore()) {
      this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
    } else {
      this.#restoreFlowState.exit();
    }
  }
}