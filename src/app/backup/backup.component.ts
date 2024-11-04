import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import {
  SparkleIconComponent,
  SparkleProgressBarComponent,
  SparkleRadioComponent,
  SparkleStepperComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { SysinfoState } from '../core/states/sysinfo.state';
import { BackupState } from './backup.state';

@Component({
  selector: 'app-backup',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    StatusBarComponent,
    SparkleRadioComponent,
    SparkleStepperComponent,
    SparkleIconComponent,
    SparkleProgressBarComponent,
  ],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class BackupComponent {
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);
  #sysinfo = inject(SysinfoState);

  isDraft = this.#backupState.isDraft;
  backupId = this.#backupState.backupId;
  loadingBackup = this.#backupState.loadingBackup;
  sysinfoLoaded = this.#sysinfo.isLoaded;
  finishedLoading = this.#backupState.finishedLoading;

  ngOnInit() {
    const snapshot = this.#route.snapshot;
    const isDraft = !!snapshot.url.find((x) => x.path === 'backup-draft');
    const backupId = snapshot.params['id'];

    this.#backupState.init(backupId, isDraft);
  }
}
