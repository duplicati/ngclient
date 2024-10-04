import { HttpClient } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleButtonGroupComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { finalize, switchMap } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import { validateWhen, watchField } from '../../core/validators/custom.validators';

const fb = new FormBuilder();

@Component({
  selector: 'app-export',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,

    SparkleButtonGroupComponent,
    SparkleToggleComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleButtonComponent,
  ],
  templateUrl: './export.component.html',
  styleUrl: './export.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExportComponent {
  #dupServer = inject(DuplicatiServerService);
  #route = inject(ActivatedRoute);
  #router = inject(Router);
  #httpClient = inject(HttpClient);
  #backups = inject(BackupsState);

  isExporting = signal(false);
  exportType = signal<'file' | 'cmd'>('file');
  exportedCmd = signal<string | null>(null);
  exportForm = fb.group({
    exportPasswords: fb.control<boolean>(true),
    encryption: fb.control<boolean>(false, [Validators.required, watchField()]),
    password: fb.control<string>('', [validateWhen((t) => t?.value.encryption, [Validators.required])]),
    repeatPassword: fb.control<string>('', [validateWhen((t) => t?.value.encryption, [Validators.required])]),
  });

  exportFormSignal = toSignal(this.exportForm.valueChanges);
  encryptionFieldSignal = computed(() => this.exportFormSignal()?.encryption ?? false);
  activeBackup = computed(() =>
    this.#backups.backups().find((x) => x.Backup?.ID === this.#route.snapshot.params['id'])
  );

  submit() {
    this.isExporting.set(true);

    if (this.exportType() === 'file') {
      this.#dupServer
        .postApiV1AuthIssuetokenByOperation({
          operation: 'export',
        })
        .pipe(
          switchMap((x) => {
            const objToQueryString = (obj: any) => {
              const entries = Object.entries(obj);
              return entries ? '?' + entries.map(([key, value]) => `${key}=${value}`).join('&') : '';
            };

            return this.#httpClient.get(
              `/api/v1/backup/${this.#route.snapshot.params['id']}/export${objToQueryString({
                exportPasswords: this.exportFormSignal()?.exportPasswords ?? undefined,
                passphrase: this.exportFormSignal()?.password ?? undefined,
                token: x.Token as string,
              })}`,
              {
                responseType: 'blob',
              }
            );
          }),
          finalize(() => this.isExporting.set(false))
        )
        .subscribe({
          next: (res) => {
            const backup = this.activeBackup();
            const backupName = backup?.Backup?.Name ?? 'Backup';
            const fileExt = this.exportFormSignal()?.encryption ? 'aes' : 'json';

            this.downloadFile(res, `${backupName}.${fileExt}`);
            this.#router.navigate(['/']);
          },
          error: (err) => {
            console.log('err', err);
          },
        });
    } else {
      this.#dupServer
        .getApiV1BackupByIdExportCmdline({
          id: this.#route.snapshot.params['id'],
          exportPasswords: this.exportFormSignal()?.exportPasswords ?? undefined,
          passphrase: this.exportFormSignal()?.password ?? undefined,
        })
        .pipe(finalize(() => this.isExporting.set(false)))
        .subscribe({
          next: (res) => {
            console.log('res', res);
            this.exportedCmd.set(res.Command ?? null);
          },
          error: (err) => {
            console.log('err', err);
          },
        });
    }
  }

  downloadFile(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    window.URL.revokeObjectURL(url);
  }
}
