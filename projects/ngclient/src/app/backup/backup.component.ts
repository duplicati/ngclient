import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ChangeDetectionStrategy, Component, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipStepper } from '@ship-ui/core/ship-stepper';
import { defer, take } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServer, GetBackupResultDto, SettingDto } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import { BackupState } from './backup.state';

@Component({
  selector: 'app-backup',
  imports: [
    ShipButton,
    ShipIcon,
    ShipAlert,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    StatusBarComponent,
    ShipStepper,
    ShipProgressBar,
  ],
  templateUrl: './backup.component.html',
  styleUrl: './backup.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class BackupComponent {
  #route = inject(ActivatedRoute);
  #router = inject(Router);
  #backupState = inject(BackupState);
  #backupsState = inject(BackupsState); // List
  #dupServer = inject(DuplicatiServer);

  isDraft = this.#backupState.isDraft;
  isNew = this.#backupState.isNew;
  backupId = this.#backupState.backupId;
  backupName = this.#backupState.backupName;
  saveState = this.#backupState.saveState;
  isSubmitting = this.#backupState.isSubmitting;
  finishedLoading = this.#backupState.finishedLoading;

  #routeParamsSignal = toSignal(this.#route.params);
  #routeUrlSignal = toSignal(this.#route.url);

  paramsChanged = effect(() => {
    const backupId = this.#routeParamsSignal()?.['id'];
    const isDraft = !!this.#routeUrlSignal()?.find((x) => x.path === 'backup-draft');

    if (backupId == this.#backupState.backupId()) return;
    this.#backupState.backupId.set(backupId);

    if (backupId !== 'new') {
      this.getBackup(backupId, isDraft);
    } else {
      this.getDefaults();
    }
  });

  saveChanges() {
    if (!this.finishedLoading() || this.isSubmitting() || this.isNew() || this.isDraft()) return;
    const validation = this.#backupState.validateBeforeSubmit();
    if (validation) {
      const step = validation === 'source' ? 'source-data' : validation;
      this.#router.navigate([step], { relativeTo: this.#route });
      return;
    }
    this.#backupState.submit(true);
  }

  getDefaults() {
    defer(() => this.#dupServer.getApiV1Backupdefaults())
      .pipe(take(1))
      .subscribe({
        next: (res: any) => {
          const backup = res.Backup;

          backup.Settings = [...backup.Settings];
          this.#backupState.mapGeneralToForm(backup);
          this.#backupState.mapDestinationToForm(backup);
          this.#backupState.mapSourceDataToForm(backup);
          this.#backupState.mapScheduleToForm(res.Schedule);
          this.#backupState.mapOptionsToForms(backup);
          this.#backupState.applicationOptions.set(res.ApplicationOptions as SettingDto[]);
          this.#backupState.backupDefaults.set(res);
          this.#backupState.finishedLoading.set(true);
        },
      });
  }

  getBackup(id: string, isDraft = false) {
    const onBackup = (res: GetBackupResultDto) => {
      this.#backupState.mapScheduleToForm(res.Schedule ?? null);

      if (res.Backup) {
        this.#backupState.mapGeneralToForm(res.Backup);
        this.#backupState.mapDestinationToForm(res.Backup);
        this.#backupState.mapSourceDataToForm(res.Backup);
        this.#backupState.mapOptionsToForms(res.Backup);
        this.#backupState.storeMetadata(res.Backup, isDraft);
      }

      this.#backupState.finishedLoading.set(true);
    };

    if (isDraft) {
      this.isDraft.set(isDraft);

      const backup = this.#backupsState.draftBackups().find((x) => x.id === id);

      if (!backup) {
        // TODO alert the user

        alert('Backup not found');
        return;
      }

      onBackup(backup.data);
    } else {
      defer(() =>
        this.#dupServer.getApiV1BackupById({
          path: { id },
        })
      ).subscribe({
        next: onBackup,
      });
    }
  }
}
