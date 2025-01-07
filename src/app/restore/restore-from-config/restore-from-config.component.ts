import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  SparkleAlertService,
  SparkleButtonComponent,
  SparkleFileDragDropDirective,
  SparkleFormFieldComponent,
  SparkleIconComponent,
} from '@sparkle-ui/core';
import { finalize, switchMap } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';
import { BackupDraft } from '../../core/states/backups.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-restore-from-config',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    SparkleFileDragDropDirective,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
  ],
  templateUrl: './restore-from-config.component.html',
  styleUrl: './restore-from-config.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreFromConfigComponent {
  #sparkleAlertService = inject(SparkleAlertService);
  #dupServer = inject(DuplicatiServerService);
  #router = inject(Router);

  isRestoring = signal(false);
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
    this.isRestoring.set(true);

    this.#dupServer
      .postApiV1BackupsImport({
        requestBody: this.importForm.value,
      })
      .pipe(
        switchMap((res) => {
          return this.#dupServer.postApiV1Backups({
            requestBody: res.data as BackupDraft,
            temporary: true,
          });
        }),
        finalize(() => this.isRestoring.set(false))
      )
      .subscribe({
        next: (res) => {
          console.log('/restore-draft', res.ID);

          this.#router.navigate(['/restore-draft', res.ID]);
        },
        error: (err) => {
          this.#sparkleAlertService.error(err.message);
        },
      });
  }
}
