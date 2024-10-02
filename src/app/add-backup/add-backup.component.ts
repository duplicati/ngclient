import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SparkleButtonComponent, SparkleCardComponent, SparkleIconComponent } from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';

@Component({
  selector: 'app-add-backup',
  standalone: true,
  imports: [StatusBarComponent, SparkleButtonComponent, SparkleCardComponent, SparkleIconComponent, RouterLink],
  templateUrl: './add-backup.component.html',
  styleUrl: './add-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class AddBackupComponent {}
