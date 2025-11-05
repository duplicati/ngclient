import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton, ShipCard, ShipIcon } from '@ship-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';

@Component({
  selector: 'app-add-backup',
  imports: [StatusBarComponent, ShipButton, ShipCard, ShipIcon, RouterLink],
  templateUrl: './add-backup.component.html',
  styleUrl: './add-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AddBackupComponent {}
