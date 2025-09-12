import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ShipButtonComponent, ShipDialogComponent, ShipIconComponent } from '@ship-ui/core';
import { map } from 'rxjs';
import { DuplicatiServer, LicenseDto } from '../../core/openapi';

type Data = {
  name: string;
  description: string;
  link: string;
  license: string;
  notes: string;
};

@Component({
  selector: 'app-libraries',
  imports: [ShipIconComponent, ShipButtonComponent, ShipDialogComponent],
  templateUrl: './libraries.component.html',
  styleUrl: './libraries.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LibrariesComponent {
  #dupServer = inject(DuplicatiServer);

  licenses = toSignal(
    this.#dupServer.getApiV1Licenses().pipe(
      map((x) => {
        return x.map((y) => {
          return {
            ...y,
            data: (y.Jsondata ? JSON.parse(y.Jsondata) : null) as Data | null,
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
