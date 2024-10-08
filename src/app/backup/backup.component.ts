import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleIconComponent, SparkleRadioComponent, SparkleStepperComponent } from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
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
  ],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class BackupComponent {
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);

  isDraft = this.#backupState.isDraft;
  backupId = this.#backupState.backupId;

  ngOnInit() {
    const snapshot = this.#route.snapshot;
    const isDraft = !!snapshot.url.find((x) => x.path === 'draft');
    const backupId = snapshot.params['id'];

    this.#backupState.init(backupId, isDraft);
  }
}
