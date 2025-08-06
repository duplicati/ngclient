import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButtonComponent, ShipCardComponent, ShipIconComponent } from '@ship-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';

@Component({
  selector: 'app-add-backup',
  imports: [StatusBarComponent, ShipButtonComponent, ShipCardComponent, ShipIconComponent, RouterLink],
  templateUrl: './add-backup.component.html',
  styleUrl: './add-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AddBackupComponent {}
