import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { SysinfoState } from '../core/states/sysinfo.state';

@Component({
  selector: 'app-add-backup',
  imports: [StatusBarComponent, ShipButton, ShipCard, ShipIcon, RouterLink],
  templateUrl: './add-backup.component.html',
  styleUrl: './add-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AddBackupComponent {
  hasRestoreControlFilesOperation = inject(SysinfoState).hasRestoreControlFilesOperation;
}
