import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { SparkleIconComponent, SparkleRadioComponent, SparkleStepperComponent } from '@sparkle-ui/core';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { CreateEditBackupState } from './create-edit-backup.state';

@Component({
  selector: 'app-create-edit-backup',
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
  templateUrl: './create-edit-backup.component.html',
  styleUrl: './create-edit-backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [CreateEditBackupState],
})
export default class CreateEditBackupComponent {
  #route = inject(ActivatedRoute);
  #createEditBackupState = inject(CreateEditBackupState);

  backupId = this.#createEditBackupState.backupId;

  ngOnInit() {
    this.#createEditBackupState.init(this.#route.snapshot.params['id']);
  }
}
