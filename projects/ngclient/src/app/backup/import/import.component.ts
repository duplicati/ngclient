import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  ShipAlertService,
  ShipButton,
  ShipDialogService,
  ShipFileUpload,
  ShipFormField,
  ShipIcon,
  ShipToggle,
} from '@ship-ui/core';
import { finalize } from 'rxjs';
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

  onFileDropped(files: File[]) {
    const file = files[0];

    if (file) {
      const reader = new FileReader();

      // Rely on minetype (really extension)
      this.isSecureFile.set(file.type !== 'application/json');

      reader.onload = this.#handleReaderLoaded.bind(this);
      reader.readAsArrayBuffer(file);
    }
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
    this.isImporting.set(true);
    const isDirectImport = this.importForm.value.direct ?? false;

    this.#dupServer
      .postApiV1BackupsImport({
        requestBody: this.importForm.value,
      })
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
