import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ShipButton } from '@ship-ui/core';

export type ConfirmDialogData = {
  title: string;
  message?: string;
  confirmText?: string | null;
  cancelText?: string | null;
};

const DEFAULT_DATA: ConfirmDialogData = {
  title: $localize`Are you sure?`,
  confirmText: undefined,
  cancelText: $localize`Cancel`,
};

@Component({
  selector: 'app-confirm-dialog',
  imports: [ShipButton],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  data = input<ConfirmDialogData>();

  _data = computed(() => {
    return {
      ...DEFAULT_DATA,
      ...this.data(),
    };
  });

  closed = output<boolean>();

  close(type: 'confirm' | 'cancel' = 'confirm') {
    this.closed.emit(type === 'confirm');
  }
}
