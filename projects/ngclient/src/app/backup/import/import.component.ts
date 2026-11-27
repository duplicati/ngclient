import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { NullableTextControl } from '../general/nullable-text-control';
import { Router, RouterLink } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFileUpload } from '@ship-ui/core/ship-file-upload';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { defer, finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, ImportBackupInputDto } from '../../core/openapi';
import { BackupDraft, BackupsState } from '../../core/states/backups.state';
import { SysinfoState } from '../../core/states/sysinfo.state';

@Component({
  selector: 'app-import',
  imports: [
    FormField,
    NullableTextControl,
    RouterLink,
    ShipFormField,
    ShipIcon,
    ShipButton,
    ShipToggle,
    ShipFileUpload,
  ],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ImportComponent {
  #shipAlertService = inject(ShipAlertService);
  #dialog = inject(ShipDialogService);

  #dupServer = inject(DuplicatiServer);
  #backupsState = inject(BackupsState);
  #router = inject(Router);
  hasGlobalOptionsImport = inject(SysinfoState).hasExportGlobalSettings;

  isImporting = signal(false);
  isSecureFile = signal(false);
  isValid = signal(false);

  importForm = form(
    signal<{
      config: string | null;
      cmdline: boolean;
      import_metadata: boolean;
      direct: boolean;
      passphrase: string | null;
      global_options: string;
    }>({ config: '', cmdline: false, import_metadata: false, direct: false, passphrase: '', global_options: 'ignore' })
  );

  globalOptionsChoices = computed(() => [
    { value: 'ignore', label: $localize`Ignore` },
    { value: 'merge', label: $localize`Merge into this backup` },
    ...(this.importForm.direct().value() ? [{ value: 'apply', label: $localize`Apply to server settings` }] : []),
  ]);

  #resetGlobalOptionsChoice = effect(() => {
    if (!this.importForm.direct().value() && this.importForm.global_options().value() === 'apply') {
      this.importForm.global_options().value.set('ignore');
    }
  });

  selectedFileField = form(signal<File[]>([]));
  selectedFile = this.selectedFileField().value;
  #reader: FileReader | null = null;
  #destroyed = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.#destroyed = true;
      this.#cancelRead();
    });
  }

  onFileDropped(files: File[]) {
    if (this.#destroyed) return;
    this.#cancelRead();
    const file = files[0];
    this.selectedFile.set(file ? [file] : []);
    this.isValid.set(false);
    this.isSecureFile.set(false);
    this.importForm.config().value.set('');
    this.importForm.global_options().value.set('ignore');

    if (file) {
      const reader = new FileReader();
      this.#reader = reader;

      // Rely on minetype (really extension)
      this.isSecureFile.set(file.type !== 'application/json');

      reader.onload = (event) => {
        if (this.#reader !== reader) return;
        try {
          if (reader.result === null || typeof reader.result === 'string') throw new Error('Missing file contents');
          this.#handleReaderLoaded(event);
          this.#cancelRead();
        } catch {
          this.#readFailed(reader);
        }
      };
      reader.onerror = () => this.#readFailed(reader);
      reader.onabort = () => this.#readFailed(reader);
      try {
        reader.readAsArrayBuffer(file);
      } catch {
        this.#readFailed(reader);
      }
    }
  }

  #cancelRead() {
    const reader = this.#reader;
    this.#reader = null;
    if (!reader) return;
    reader.onload = null;
    reader.onerror = null;
    reader.onabort = null;
    if (reader.readyState === FileReader.LOADING) reader.abort();
  }

  #readFailed(reader: FileReader) {
    if (this.#reader !== reader) return;
    this.#cancelRead();
    this.isValid.set(false);
    this.isSecureFile.set(false);
    this.importForm.config().value.set('');
    this.#dialog.open(ConfirmDialogComponent, {
      data: {
        title: $localize`Failed to read configuration file`,
        message: $localize`The file could not be read. Please select the configuration file again.`,
        confirmText: $localize`OK`,
        cancelText: undefined,
      },
    });
  }

  #handleReaderLoaded(readerEvt: ProgressEvent<FileReader>) {
    const arrayBuffer = readerEvt.target?.result as ArrayBuffer;

    // Check on the actual content of the ArrayBuffer
    this.isSecureFile.set(this.#checkArrayBufferType(arrayBuffer) !== 'json');

    this.importForm.config().value.set(this.#arrayBufferToBase64(arrayBuffer));
    this.isValid.set(this.importForm.config().value() !== '');
  }

  #checkArrayBufferType(buffer: ArrayBuffer): 'json' | 'aes' | 'unknown' {
    const bytes = new Uint8Array(buffer);

    // Check if it starts with "AES" and the 5th byte is 0
    if (
      bytes.length >= 5 &&
      bytes[0] === 0x41 && // 'A'
      bytes[1] === 0x45 && // 'E'
      bytes[2] === 0x53 && // 'S'
      bytes[4] === 0x00
    ) {
      return 'aes';
    }

    // Attempt to decode as text and parse as JSON
    try {
      const text = new TextDecoder().decode(buffer);
      const json = JSON.parse(text);
      if (typeof json === 'object' && json !== null) {
        return 'json';
      }
    } catch {
      // Not JSON
    }

    return 'unknown';
  }

  #arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    let binary = '';

    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return btoa(binary);
  }

  submit() {
    if (this.#destroyed || this.isImporting() || this.#reader || !this.importForm.config().value()) return;
    const { global_options: selected, ...values } = this.importForm().value();
    const globalOptions = selected === 'merge' || (selected === 'apply' && values.direct) ? selected : 'ignore';
    const body: ImportBackupInputDto = {
      ...values,
      ...(this.hasGlobalOptionsImport() ? { global_options: globalOptions } : {}),
    };
    this.isImporting.set(true);

    if (body.global_options === 'apply') {
      let decided = false;
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Apply global advanced options?`,
          message: $localize`This changes this server's settings for all backups. Imported values replace matching global options; other global options are kept. Continue?`,
          confirmText: $localize`Apply and import`,
          cancelText: $localize`Cancel`,
        },
        closed: (confirmed) => {
          if (decided || this.#destroyed) return;
          decided = true;
          if (confirmed) this.#import(body);
          else this.isImporting.set(false);
        },
      });
      return;
    }
    this.#import(body);
  }

  #import(body: ImportBackupInputDto) {
    const isDirectImport = body.direct;

    defer(() =>
      this.#dupServer.postApiV1BackupsImport({
        body,
      })
    )
      .pipe(finalize(() => this.isImporting.set(false)))
      .subscribe({
        next: (res) => {
          if (isDirectImport) {
            this.#shipAlertService.success('Backup imported successfully.');
            this.#router.navigate(['/']);
            return;
          }
          const draftId = this.#backupsState.addDraftBackup(res.data as BackupDraft);

          this.#router.navigate(['/backup-draft', draftId]);
        },
        error: (err) => {
          const message = err.message || $localize`Unknown error`;
          this.#dialog.open(ConfirmDialogComponent, {
            data: {
              title: $localize`Failed to import backup`,
              message: message,
              confirmText: $localize`OK`,
              cancelText: undefined,
            },
          });
        },
      });
  }
}
