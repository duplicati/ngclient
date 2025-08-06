import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipAlertComponent, ShipCheckboxComponent, ShipRadioComponent } from '@ship-ui/core';
import { finalize } from 'rxjs';
import { DuplicatiServerService } from '../../../openapi';

const PAUSE_OPTIONS = [
  { label: $localize`5 minutes`, value: '5m' },
  { label: $localize`10 minutes`, value: '10m' },
  { label: $localize`15 minutes`, value: '15m' },
  { label: $localize`30 minutes`, value: '30m' },
  { label: $localize`1 hour`, value: '1h' },
  { label: $localize`4 hours`, value: '4h' },
  { label: $localize`8 hours`, value: '8h' },
  { label: $localize`24 hours`, value: '24h' },
  { label: $localize`Until resumed`, value: undefined },
];

@Component({
  selector: 'app-pause-dialog',
  imports: [FormsModule, ShipRadioComponent, ShipCheckboxComponent, ShipAlertComponent],
  templateUrl: './pause-dialog.component.html',
  styleUrl: './pause-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PauseDialogComponent {
  #dupServer = inject(DuplicatiServerService);

  pauseOptions = signal(PAUSE_OPTIONS);

  closed = output<void>();
  isSubmitting = signal<boolean>(false);
  pauseTransfers = signal<boolean>(false);
  pauseOption = signal<string | undefined>(undefined);

  submit() {
    this.isSubmitting.set(true);

    const pauseTransfers = this.pauseTransfers() || null;
    const duration = this.pauseOption();

    this.#dupServer
      .postApiV1ServerstatePause({
        duration,
        pauseTransfers,
      } as any)
      .pipe(finalize(() => this.isSubmitting.set(false)))
      .subscribe({
        next: (_) => {
          this.closed.emit();
        },
      });
  }
}
