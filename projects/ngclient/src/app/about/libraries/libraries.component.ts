import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialog } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { defer, map } from 'rxjs';
import { DuplicatiServer, LicenseDto } from '../../core/openapi';

type Data = {
  name: string;
  description: string;
  link: string;
  license: string;
  notes: string;
};

function parseLicenseMetadata(jsondata: LicenseDto['Jsondata']): Data | null {
  if (!jsondata) return null;
  try {
    const parsed: unknown = JSON.parse(jsondata);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const fields = parsed as Record<string, unknown>;
    const text = (key: keyof Data) => {
      const value = fields[key];
      return typeof value === 'string' ? value : '';
    };
    return {
      name: text('name'),
      description: text('description'),
      link: text('link'),
      license: text('license'),
      notes: text('notes'),
    };
  } catch {
    return null;
  }
}

@Component({
  selector: 'app-libraries',
  imports: [ShipIcon, ShipButton, ShipDialog],
  templateUrl: './libraries.component.html',
  styleUrl: './libraries.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LibrariesComponent {
  #dupServer = inject(DuplicatiServer);

  licenses = toSignal(
    defer(() => this.#dupServer.getApiV1Licenses()).pipe(
      map((x) => {
        return x.map((y) => {
          return {
            ...y,
            data: parseLicenseMetadata(y.Jsondata),
          };
        });
      })
    )
  );

  dialogIsOpen = signal(false);
  dialogLicense = signal<LicenseDto | null>(null);

  #dialogEffect = effect(() => {
    const license = this.dialogLicense();

    if (!license) return;

    this.dialogIsOpen.set(true);
  });

  openLicense(license: LicenseDto) {
    this.dialogLicense.set(license);
  }

  closeLicense() {
    this.dialogIsOpen.set(false);
    this.dialogLicense.set(null);
  }

  breakIntoLines(str: string) {
    const codeLines = str.split('\n');
    let numberedCode = '';

    for (let i = 0; i < codeLines.length; i++) {
      numberedCode += `<li>${codeLines[i]}</li>`;
    }

    return numberedCode;
  }
}
