import { ChangeDetectionStrategy, Component, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipFormFieldComponent, ShipSelectComponent } from '@ship-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../../openapi';

const UNIT_MAP = {
  Byte: 'B',
  KByte: 'KB',
  MByte: 'MB',
  GByte: 'GB',
  TByte: 'TB',
  PByte: 'PB',
};

const BPS_SIZE_OPTIONS = ['mbps', 'gbps'] as const;
type BpsSizeOptions = (typeof BPS_SIZE_OPTIONS)[number];

const BYTE_TO_BITS = 8;
const KILO_BYTES = 1024;
const MEGA_BYTES = KILO_BYTES * 1024;
const GIGA_BYTES = MEGA_BYTES * 1024;
const TERA_BYTES = GIGA_BYTES * 1024;
const PETA_BYTES = TERA_BYTES * 1024;

const API_UNIT_TO_BYTES_FACTOR: { [key: string]: number } = {
  B: 1,
  KB: KILO_BYTES,
  MB: MEGA_BYTES,
  GB: GIGA_BYTES,
  TB: TERA_BYTES,
  PB: PETA_BYTES,
};

const KILO_BITS_PER_SEC = 1000;
const MEGA_BITS_PER_SEC = KILO_BITS_PER_SEC * 1000;
const GIGA_BITS_PER_SEC = MEGA_BITS_PER_SEC * 1000;

const SUBMISSION_UNIT_THRESHOLDS = [
  { threshold: PETA_BYTES, unitPrefix: 'PByte' as keyof typeof UNIT_MAP },
  { threshold: TERA_BYTES, unitPrefix: 'TByte' as keyof typeof UNIT_MAP },
  { threshold: GIGA_BYTES, unitPrefix: 'GByte' as keyof typeof UNIT_MAP },
  { threshold: MEGA_BYTES, unitPrefix: 'MByte' as keyof typeof UNIT_MAP },
  { threshold: KILO_BYTES, unitPrefix: 'KByte' as keyof typeof UNIT_MAP },
  { threshold: 1, unitPrefix: 'Byte' as keyof typeof UNIT_MAP },
];

@Component({
  selector: 'app-throttle-settings-dialog',
  imports: [FormsModule, ShipFormFieldComponent, ShipSelectComponent],
  templateUrl: './throttle-settings-dialog.component.html',
  styleUrl: './throttle-settings-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class ThrottleSettingsDialogComponent implements OnInit {
  #dupServer = inject(DuplicatiServerService);

  closed = output<boolean>();

  isSubmitting = signal<boolean>(false);
  sizeOptions = signal<(typeof BPS_SIZE_OPTIONS)[number][]>([...BPS_SIZE_OPTIONS]);
  maxUpload = signal<number>(0);
  maxDownload = signal<number>(0);
  maxUploadUnit = signal<BpsSizeOptions>('mbps');
  maxDownloadUnit = signal<BpsSizeOptions>('mbps');

  ngOnInit() {
    this.init();
  }

  convertToBitsPerSecondUnits(apiValue: number, apiUnitSuffix: string): { value: number; unit: BpsSizeOptions } {
    const bytesPerSecond = apiValue * (API_UNIT_TO_BYTES_FACTOR[apiUnitSuffix.toUpperCase()] || MEGA_BYTES);
    const bitsPerSecond = bytesPerSecond * BYTE_TO_BITS;

    if (bitsPerSecond === 0) {
      return { value: 0, unit: 'mbps' };
    }
    if (bitsPerSecond >= GIGA_BITS_PER_SEC) {
      return { value: parseFloat((bitsPerSecond / GIGA_BITS_PER_SEC).toFixed(2)), unit: 'gbps' };
    } else {
      return { value: parseFloat((bitsPerSecond / MEGA_BITS_PER_SEC).toFixed(2)), unit: 'mbps' };
    }
  }
  convertFromBitsPerSecondUnits(
    displayValue: number,
    displayUnit: BpsSizeOptions
  ): { valueForApi: number; unitPrefixForApi: keyof typeof UNIT_MAP } {
    let bitsPerSecond = 0;

    switch (displayUnit) {
      case 'gbps':
        bitsPerSecond = displayValue * GIGA_BITS_PER_SEC;
        break;
      case 'mbps':
        bitsPerSecond = displayValue * MEGA_BITS_PER_SEC;
        break;
    }

    const bytesPerSecond = bitsPerSecond / BYTE_TO_BITS;

    if (bytesPerSecond === 0) {
      return { valueForApi: 0, unitPrefixForApi: 'Byte' };
    }

    for (const { threshold, unitPrefix } of SUBMISSION_UNIT_THRESHOLDS) {
      if (bytesPerSecond >= threshold) {
        return { valueForApi: Math.round(bytesPerSecond / threshold), unitPrefixForApi: unitPrefix };
      }
    }

    return { valueForApi: Math.round(bytesPerSecond), unitPrefixForApi: 'Byte' };
  }

  init() {
    this.#dupServer.getApiV1Serversettings().subscribe({
      next: (res) => {
        const rawUploadSpeedString = res?.['max-upload-speed'];
        const rawDownloadSpeedString = res?.['max-download-speed'];

        if (rawUploadSpeedString && rawUploadSpeedString !== '') {
          // Regex to capture number and unit, e.g., "10MB" -> "10", "MB"
          const match = rawUploadSpeedString.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)$/);

          if (match) {
            const apiUploadValue = parseFloat(match[1]);
            const apiUploadUnitSuffix = match[2];
            const converted = this.convertToBitsPerSecondUnits(apiUploadValue, apiUploadUnitSuffix);
            this.maxUpload.set(converted.value);
            this.maxUploadUnit.set(converted.unit);
          } else {
            console.warn('Unexpected max-upload-speed format from API:', rawUploadSpeedString);
            this.resetUpload();
          }
        } else {
          this.resetUpload();
        }

        if (rawDownloadSpeedString && rawDownloadSpeedString !== '') {
          const match = rawDownloadSpeedString.match(/^(\d+(?:\.\d+)?)([A-Za-z]+)$/);

          if (match) {
            const apiDownloadValue = parseFloat(match[1]);
            const apiDownloadUnitSuffix = match[2];
            const converted = this.convertToBitsPerSecondUnits(apiDownloadValue, apiDownloadUnitSuffix);
            this.maxDownload.set(converted.value);
            this.maxDownloadUnit.set(converted.unit);
          } else {
            console.warn('Unexpected max-download-speed format from API:', rawDownloadSpeedString);
            this.resetDownload();
          }
        } else {
          this.resetDownload();
        }
      },
      error: (err) => {
        console.error('Failed to get server settings:', err);
        // Initialize with defaults if API call fails
        this.resetDownload();
        this.resetUpload();
      },
    });
  }

  resetDownload() {
    this.maxDownload.set(0);
    this.maxDownloadUnit.set('mbps');
  }

  resetUpload() {
    this.maxUpload.set(0);
    this.maxUploadUnit.set('mbps');
  }

  // This will block decimal inputs (e.g., 1.5 mbps).
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

    let uploadSpeedPayload = '';
    let downloadSpeedPayload = '';

    const maxUpload = this.maxUpload() ?? 0;
    const maxUploadUnit = this.maxUploadUnit();
    const maxDownload = this.maxDownload() ?? 0;
    const maxDownloadUnit = this.maxDownloadUnit();

    if (maxUpload > 0) {
      const { valueForApi, unitPrefixForApi } = this.convertFromBitsPerSecondUnits(maxUpload, maxUploadUnit);

      const apiUnitSuffix = UNIT_MAP[unitPrefixForApi];

      if (apiUnitSuffix) {
        uploadSpeedPayload = `${valueForApi}${apiUnitSuffix}`;
      } else {
        console.error(
          `Invalid unit prefix for API submission (upload): ${unitPrefixForApi}. Defaulting to empty string.`
        );
      }
    }

    if (maxDownload) {
      const { valueForApi, unitPrefixForApi } = this.convertFromBitsPerSecondUnits(maxDownload, maxDownloadUnit);

      const apiUnitSuffix = UNIT_MAP[unitPrefixForApi];

      if (apiUnitSuffix) {
        downloadSpeedPayload = `${valueForApi}${apiUnitSuffix}`;
      } else {
        console.error(
          `Invalid unit prefix for API submission (download): ${unitPrefixForApi}. Defaulting to empty string.`
        );
      }
    }

    this.#dupServer
      .patchApiV1Serversettings({
        requestBody: {
          'max-upload-speed': uploadSpeedPayload,
          'max-download-speed': downloadSpeedPayload,
        },
      })
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: () => {
          this.closed.emit(true);
        },
        error: (err) => {
          console.error('Failed to submit throttle settings:', err);
          // Optionally, inform the user via a notification service
        },
      });
  }
}
