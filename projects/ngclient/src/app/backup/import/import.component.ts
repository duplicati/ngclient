import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
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
import { DuplicatiServer } from '../../core/openapi';
import { BackupDraft, BackupsState } from '../../core/states/backups.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-import',
  imports: [ReactiveFormsModule, RouterLink, ShipFormField, ShipIcon, ShipButton, ShipToggle, ShipFileUpload],
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

  isImporting = signal(false);
  isSecureFile = signal(false);
  isValid = signal(false);

  importForm = fb.group({
    config: fb.control<string>(''),
    cmdline: fb.control<boolean>(false),
    import_metadata: fb.control<boolean>(false),
    direct: fb.control<boolean>(false),
    passphrase: fb.control<string>(''),
  });

  selectedFile = signal<File[]>([]);
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
    this.importForm.patchValue({ config: '' });

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
    this.importForm.patchValue({ config: '' });
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

    this.importForm.patchValue({
      config: this.#arrayBufferToBase64(arrayBuffer),
    });
    this.isValid.set(this.importForm.value.config !== '');
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
    if (this.#reader || !this.importForm.controls.config.value) return;
    this.isImporting.set(true);
    const isDirectImport = this.importForm.value.direct ?? false;

    defer(() =>
      this.#dupServer.postApiV1BackupsImport({
        body: this.importForm.value,
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
