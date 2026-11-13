import { HttpClient, HttpHeaders } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';

import { applyWhen, applyWhenValue, form, FormField, minLength, required } from '@angular/forms/signals';
import { NullableTextControl } from '../general/nullable-text-control';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { defer, finalize, switchMap } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer } from '../../core/openapi';
import { PasswordGeneratorService } from '../../core/services/password-generator.service';
import { BackupsState } from '../../core/states/backups.state';
import { getApiBase, getApiConfigHeaders } from '../../core/utils/proxy-config.util';

@Component({
  selector: 'app-export',
  imports: [
    FormField,
    NullableTextControl,
    RouterLink,
    ShipButtonGroup,
    ShipToggle,
    ShipIcon,
    ShipFormField,
    ShipButton,
    ShipAlert,
    ShipProgressBar,
    ShipTooltip,
  ],
  templateUrl: './export.component.html',
  styleUrl: './export.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ExportComponent {
  #passwordGeneratorService = inject(PasswordGeneratorService);
  #dialog = inject(ShipDialogService);
  #dupServer = inject(DuplicatiServer);
  #route = inject(ActivatedRoute);
  #router = inject(Router);
  #httpClient = inject(HttpClient);
  #backups = inject(BackupsState);

  isRequiredError = (error: { kind: string }) => error.kind === 'required';
  isMinLengthError = (error: { kind: string }) => error.kind === 'minLength';
  isExporting = signal(false);
  exportType = signal<'file' | 'cmd'>('file');
  exportedCmd = signal<string | null>(null);
  exportForm = form(
    signal<{ exportPasswords: boolean; encryption: boolean; password: string | null; repeatPassword: string | null }>({
      exportPasswords: true,
      encryption: false,
      password: '',
      repeatPassword: '',
    }),
    (path) => {
      applyWhen(
        path,
        ({ value }) => value().encryption,
        (active) => {
          required(active.password);
          applyWhenValue(
            active.password,
            (value): value is string => value !== null,
            (text) => minLength(text, 3)
          );
          required(active.repeatPassword);
          applyWhenValue(
            active.repeatPassword,
            (value): value is string => value !== null,
            (text) => minLength(text, 3)
          );
        }
      );
    }
  );

  exportFormSignal = this.exportForm().value;
  encryptionFieldSignal = computed(
    () => (this.exportFormSignal()?.encryption ?? false) && this.exportType() === 'file'
  );
  activeBackup = computed(() =>
    this.#backups.backups().find((x) => x.Backup?.ID === this.#route.snapshot.params['id'])
  );

  showPassword = signal(false);
  copiedPassword = signal(false);
  showCopyPassword = signal(false);
  calculatePasswordStrength = computed(() => {
    const form = this.exportFormSignal();
    const password = form?.password ?? '';

    return this.#passwordGeneratorService.calculatePasswordStrength(password);
  });

  disablePasswordForCommandLine = effect(() => {
    if (this.exportType() === 'cmd') this.exportForm.encryption().value.set(false);
  });

  submit() {
    if (
      this.exportType() === 'file' &&
      this.exportFormSignal()?.exportPasswords === true &&
      !this.exportFormSignal()?.encryption
    ) {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Export without encryption?`,
          message: $localize`Are you sure you want to export your backup without encryption?`,
          confirmText: $localize`Yes, write plain-text passwords`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) return;

          this.submitApproved();
        },
      });
      return;
    }

    this.submitApproved();
  }

  submitApproved() {
    this.isExporting.set(true);

    if (this.exportType() === 'file') {
      const options = this.exportFormSignal();
      const passphrase = options.encryption && options.password?.length ? options.password : undefined;
      const fileExt = options.encryption ? 'aes' : 'json';

      defer(() =>
        this.#dupServer.postApiV1AuthIssuetokenByOperation({
          path: { operation: 'export' },
        })
      )
        .pipe(
          switchMap((x) => {
            const objToQueryString = (obj: any) => {
              const entries = Object.entries(obj);
              return entries
                ? '?' +
                    entries
                      .filter(([_, value]) => value !== null && value !== undefined)
                      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value as any)}`)
                      .join('&')
                : '';
            };

            const prefix = getApiBase();
            return this.#httpClient.get(
              `${prefix}/api/v1/backup/${this.#route.snapshot.params['id']}/export${objToQueryString({
                'export-passwords': options.exportPasswords ?? undefined,
                passphrase: passphrase,
                token: x.Token as string,
              })}`,
              {
                responseType: 'blob',
                headers: new HttpHeaders({
                  ...getApiConfigHeaders(),
                }),
              }
            );
          }),
          finalize(() => this.isExporting.set(false))
        )
        .subscribe({
          next: (res) => {
            const backup = this.activeBackup();
            const backupName = backup?.Backup?.Name ?? 'Backup';

            this.downloadFile(res, `${backupName}-duplicati-config.${fileExt}`);
            this.#router.navigate(['/']);
          },
          error: (err) => {
            console.error('Failed to export backup', err);
          },
        });
    } else {
      defer(() =>
        this.#dupServer.getApiV1BackupByIdExportCmdline({
          path: { id: this.#route.snapshot.params['id'] },
          query: {
            'export-passwords': this.exportFormSignal()?.exportPasswords ?? undefined,
            passphrase: this.exportFormSignal()?.password ?? undefined,
          },
        })
      )
        .pipe(finalize(() => this.isExporting.set(false)))
        .subscribe({
          next: (res) => {
            this.exportedCmd.set(res.Command ?? null);
          },
          error: (err) => {
            console.error('Failed to export backup as command line', err);
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
  async copyPassword() {
    const pass = this.exportForm.password().value();

    await this.#copyToClipboard(pass ?? '');

    this.copiedPassword.set(true);
  }

  async #copyToClipboard(text: string) {
    try {
      // Attempt to use the Clipboard API
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // Fallback to execCommand if Clipboard API fails
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      } catch (err) {
        console.error('Failed to copy text: ', err);
      }
    }
  }

  generatePassword() {
    this.copiedPassword.set(false);

    const newPass = this.#passwordGeneratorService.generate(41);
    this.exportForm.password().value.set(newPass);
    this.exportForm.repeatPassword().value.set(newPass);

    this.showCopyPassword.set(true);
  }
}
