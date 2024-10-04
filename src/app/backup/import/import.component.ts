import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFileDragDropDirective,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../core/openapi';

const fb = new FormBuilder();

@Component({
  selector: 'app-import',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,

    SparkleFileDragDropDirective,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleToggleComponent,

    JsonPipe,
  ],
  templateUrl: './import.component.html',
  styleUrl: './import.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ImportComponent {
  #dupServer = inject(DuplicatiServerService);

  isImporting = signal(false);

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

    // console.log('onFileDropped', event);
    // console.log('files', files);
    // console.log('file', file);

    if (file) {
      const reader = new FileReader();

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
          console.log('res', res);
        },
        error: (err) => {
          console.error('err', err);
        },
      });
  }
}
