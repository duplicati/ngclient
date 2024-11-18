import { inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { finalize, forkJoin, take } from 'rxjs';
import { DuplicatiServerService, GetBackupResultDto, IListResultFileset } from '../core/openapi';
import { createRestoreOptionsForm } from './options/options.component';
import { createRestoreSelectFilesForm } from './select-files/select-files.component';

@Injectable({
  providedIn: 'root',
})
export class RestoreFlowState {
  #router = inject(Router);
  #dupServer = inject(DuplicatiServerService);

  backupId = signal<'string' | null>(null);
  backup = signal<GetBackupResultDto | null>(null);
  selectFilesForm = createRestoreSelectFilesForm();
  optionsForm = createRestoreOptionsForm();
  optionsFormSignal = toSignal(this.optionsForm.valueChanges);
  selectFilesFormSignal = toSignal(this.selectFilesForm.valueChanges);
  versionOptionsLoading = signal(false);
  versionOptions = signal<IListResultFileset[]>([]);
  isSubmitting = signal(false);

  init(id: 'string') {
    this.backupId.set(id);
    this.#getBackupData(id, true);
  }

  // restoreFrom: fb.control<'orignal' | 'pickLocation'>('orignal'),
  // restoreFromPath: fb.control<string>(''),
  // handleExisting: fb.control<'overwrite' | 'saveTimestamp'>('overwrite'),
  // permissions: fb.control<boolean>(false),
  // {
  //   "paths": [
  //     "string"
  //   ],
  //   "passphrase": "string",
  //   "time": "string",
  //   "restore_path": "string",
  //   "overwrite": true,
  //   "permissions": true,
  //   "skip_metadata": true
  // }
  submit() {
    this.isSubmitting.set(true);

    const id = this.backupId();
    const optionsValue = this.optionsForm.value;
    const selectFilesFormValue = this.selectFilesForm.value;
    const selectedOption = this.versionOptions()?.find((x) => x.Version === selectFilesFormValue.selectedOption);

    this.#dupServer
      .postApiV1BackupByIdRestore({
        id: id ?? '',
        requestBody: {
          paths: selectFilesFormValue.filesToRestore?.split('\0').map((x) => `${x}*`) ?? [],
          passphrase: selectFilesFormValue.passphrase ?? null,
          time: selectedOption?.Time,
          restore_path: optionsValue.restoreFromPath,
          overwrite: optionsValue.handleExisting === 'overwrite',
          permissions: optionsValue.permissions,
          skip_metadata: true,
        },
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => this.exit(),
        error: (err) => {
          console.error('restore error', err);
        },
      });
  }

  exit() {
    // TODOS
    // - Are you sure dialog
    this.#resetAllForms();
    this.#router.navigate(['/']);
  }

  getVersionOptions() {
    this.versionOptions();
  }

  #getBackupData(id: string, setFirstToForm = false) {
    this.versionOptionsLoading.set(true);

    forkJoin([
      this.#dupServer.getApiV1BackupById({
        id,
      }),
      this.#dupServer.getApiV1BackupByIdFilesets({
        id,
      }),
    ])
      .pipe(
        take(1),
        finalize(() => this.versionOptionsLoading.set(false))
      )
      .subscribe({
        next: ([backup, filesets]) => {
          this.versionOptions.set(filesets);
          this.backup.set(backup);

          if (setFirstToForm) {
            this.selectFilesForm.controls.selectedOption.setValue(filesets[0].Version as number);
          }
        },
      });
  }

  #resetAllForms() {
    this.selectFilesForm.reset();
    this.optionsForm.reset();
  }
}
