import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-disconnected-dialog',
  imports: [],
  templateUrl: './disconnected-dialog.component.html',
  styleUrl: './disconnected-dialog.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DisconnectedDialogComponent {}
