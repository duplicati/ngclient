import { DatePipe, JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleCardComponent,
  SparkleChipComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DurationFormatPipe } from '../core/pipes/duration.pipe';
import { BackupsState } from '../core/states/backups.state';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    RouterLink,

    StatusBarComponent,

    SparkleCardComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleChipComponent,
    SparkleMenuComponent,

    JsonPipe,
    DatePipe,
    DurationFormatPipe,
  ],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class HomeComponent {
  #backupsState = inject(BackupsState);

  backups = this.#backupsState.backups;
  backupsLoading = this.#backupsState.backupsLoading;

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  startBackup(id: string) {
    this.#backupsState.startBackup(id);
  }

  deleteBackup(id: string | null | undefined) {
    if (!id) return;

    window.confirm('Are you sure you want to delete this backup?') && this.#backupsState.deleteBackup(id);
  }
}
