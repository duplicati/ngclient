import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFileUpload } from '@ship-ui/core/ship-file-upload';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { defer, finalize, from, switchMap } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { canUploadCertificate, isInsecureConnection, toUpdateCertificateRequest } from './ssl-certificate-settings';

/**
 * Uploads a PFX certificate that the server uses for HTTPS.
 * A server that already uses HTTPS picks the new certificate up for new connections;
 * a server that uses HTTP switches to HTTPS the next time it starts.
 */
@Component({
  selector: 'app-ssl-certificate',
  imports: [FormsModule, ShipAlert, ShipButton, ShipFileUpload, ShipFormField],
  templateUrl: './ssl-certificate.component.html',
  styleUrl: './ssl-certificate.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SslCertificateComponent {
  #dupServer = inject(DuplicatiServer);

  isInsecureConnection = isInsecureConnection(window.location.protocol);

  files = signal<File[]>([]);
  password = signal('');
  isUploading = signal(false);
  uploaded = signal(false);
  canUpload = computed(() => !this.isUploading() && canUploadCertificate(this.files(), this.password()));

  selectFiles(files: File[]) {
    this.files.set(files.slice(0, 1));
    this.uploaded.set(false);
  }

  upload() {
    const file = this.files()[0];
    if (!file || !this.canUpload()) return;

    const password = this.password();
    this.isUploading.set(true);
    this.uploaded.set(false);

    from(file.arrayBuffer())
      .pipe(
        switchMap((buffer) =>
          defer(() => this.#dupServer.postApiV1Uisettings({ body: toUpdateCertificateRequest(buffer, password) }))
        ),
        finalize(() => this.isUploading.set(false))
      )
      .subscribe({
        next: () => {
          this.files.set([]);
          this.password.set('');
          this.uploaded.set(true);
        },
        // The HTTP interceptor reports the error, such as a wrong password, and the form keeps its values
        error: () => {},
      });
  }
}
