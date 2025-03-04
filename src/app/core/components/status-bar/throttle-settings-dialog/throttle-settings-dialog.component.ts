import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SparkleCheckboxComponent, SparkleFormFieldComponent, SparkleSelectComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../../openapi';

const SIZE_OPTIONS = ['Byte/s', 'KByte/s', 'MByte/s', 'GByte/s', 'TByte/s', 'PByte/s'];

const UNIT_MAP = {
  Byte: 'B',
  KByte: 'KB',
  MByte: 'MB',
  GByte: 'GB',
  TByte: 'TB',
  PByte: 'PB',
};

const REVERSE_UNIT_MAP = Object.entries(UNIT_MAP).reduce((obj, [key, value]) => {
  obj[value] = key;
  return obj;
}, {} as any);

type SizeOptions = (typeof SIZE_OPTIONS)[number];
@Component({
  selector: 'app-throttle-settings-dialog',
  imports: [FormsModule, SparkleFormFieldComponent, SparkleCheckboxComponent, SparkleSelectComponent],
  templateUrl: './throttle-settings-dialog.component.html',
  styleUrl: './throttle-settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ThrottleSettingsDialogComponent {
  #dupServer = inject(DuplicatiServerService);

  closed = output<boolean>();
  isSubmitting = signal<boolean>(false);
  sizeOptions = signal(SIZE_OPTIONS);

  maxUploadActive = signal<boolean>(false);
  maxDownloadActive = signal<boolean>(false);
  maxUpload = signal<number>(0);
  maxDownload = signal<number>(0);
  maxUploadUnit = signal<SizeOptions>('MByte/s');
  maxDownloadUnit = signal<SizeOptions>('MByte/s');

  ngOnInit() {
    this.init();
  }

  init() {
    this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        const _uploadSpeedSplit = res?.['max-upload-speed']?.split(/(\d+)/);
        const _downloadSpeedSplit = res?.['max-download-speed']?.split(/(\d+)/);

        const _uploadSpeed = _uploadSpeedSplit[1] ?? '';
        const _downloadSpeed = _downloadSpeedSplit[1] ?? '';
        const uploadSpeedUnit = _uploadSpeedSplit[2] ?? 'MB';
        const downloadSpeedUnit = _downloadSpeedSplit[2] ?? 'MB';
        const uploadSpeed = _uploadSpeed === '' ? 10 : parseInt(_uploadSpeed);
        const downloadSpeed = _downloadSpeed === '' ? 10 : parseInt(_downloadSpeed);

        this.maxUploadUnit.set((REVERSE_UNIT_MAP[uploadSpeedUnit] + '/s') as SizeOptions);
        this.maxDownloadUnit.set((REVERSE_UNIT_MAP[downloadSpeedUnit] + '/s') as SizeOptions);

        this.maxUploadActive.set(_uploadSpeed !== '');
        this.maxDownloadActive.set(_downloadSpeed !== '');

        this.maxUpload.set(uploadSpeed);
        this.maxDownload.set(downloadSpeed);
      },
    });
  }

  blockDecimalKeys($event: KeyboardEvent) {
    if (['.', ','].includes($event.key)) return $event.preventDefault();
  }

  cleanupInputAfterPasting($event: ClipboardEvent) {
    $event.preventDefault();

    const clipboardData = $event.clipboardData?.getData('text/plain');

    if (!clipboardData) return;

    const cleanedData = clipboardData.replaceAll(/[\.,]/g, '');

    ($event.target as HTMLInputElement).value = cleanedData;
  }

  submit() {
    this.isSubmitting.set(true);

    const uploadSpeed = this.maxUploadActive()
      ? `${this.maxUpload()}${UNIT_MAP[this.maxUploadUnit().replace('/s', '') as keyof typeof UNIT_MAP]}`
      : '';

    const downloadSpeed = this.maxDownloadActive()
      ? `${this.maxDownload()}${UNIT_MAP[this.maxDownloadUnit().replace('/s', '') as keyof typeof UNIT_MAP]}`
      : '';

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'max-upload-speed': uploadSpeed,
          'max-download-speed': downloadSpeed,
        },
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (res) => {
          this.closed.emit(true);
        },
      });
  }
}
