import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

export type ConfirmDialogData = {
  title: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
};

const DEFAULT_DATA: ConfirmDialogData = {
  title: 'Are you sure?',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
};

@Component({
    selector: 'app-confirm-dialog',
    imports: [],
    templateUrl: './confirm-dialog.component.html',
    styleUrl: './confirm-dialog.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
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
