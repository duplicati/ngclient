import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  SparkleAlertService,
  SparkleButtonComponent,
  SparkleFileDragDropDirective,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';
import { BackupDraft, BackupsState } from '../../core/states/backups.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-import',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SparkleFileDragDropDirective,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleToggleComponent,
  ],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ImportComponent {
  #sparkleAlertService = inject(SparkleAlertService);
  #dupServer = inject(DuplicatiServerService);
  #backupsState = inject(BackupsState);
  #router = inject(Router);

  isImporting = signal(false);
  isSecureFile = signal(false);

  importForm = fb.group({
    config: fb.control<string>(''),
    cmdline: fb.control<boolean>(false),
    importMetadata: fb.control<boolean>(false),
    direct: fb.control<boolean>(false),
    passphrase: fb.control<string>(''),
  });

  selectedFile = signal<File | null>(null);

  onFileDropped(event: Event) {
    const files = (event.target as HTMLInputElement)?.files;
    const file = files?.item(0);

    if (file) {
      const reader = new FileReader();

      this.isSecureFile.set(file.type !== 'application/json');

      reader.onload = this.#handleReaderLoaded.bind(this);
      reader.readAsArrayBuffer(file);
    }
  }

  #handleReaderLoaded(readerEvt: ProgressEvent<FileReader>) {
    const arrayBuffer = readerEvt.target?.result as ArrayBuffer;

    this.importForm.patchValue({
      config: this.#arrayBufferToBase64(arrayBuffer),
    });
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

    this.#dupServer
      .postApiV1BackupsImport({
        requestBody: this.importForm.value,
      })
      .pipe(finalize(() => this.isImporting.set(false)))
      .subscribe({
        next: (res) => {
          const draftId = this.#backupsState.addDraftBackup(res.data as BackupDraft);

          this.#router.navigate(['/backup-draft', draftId]);
        },
        error: (err) => {
          this.#sparkleAlertService.error(err.message);
        },
      });
  }
}
