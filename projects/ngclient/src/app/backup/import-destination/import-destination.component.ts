import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipStepper } from '@ship-ui/core/ship-stepper';
import { BackupState } from '../backup.state';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { ImportDestinationState } from './import-destination.state';

@Component({
  selector: 'app-import-destination',
  imports: [ShipStepper, StatusBarComponent, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './import-destination.component.html',
  styleUrl: './import-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [ImportDestinationState, BackupState],
})
export default class ImportDestinationComponent {}
