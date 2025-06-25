import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleDialogService,
  SparkleDividerComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { BackupDto, CommandlineService, DuplicatiServerService, GetBackupResultDto } from '../../core/openapi';
import { BackupState } from '../backup.state';
import { OptionsListComponent } from '../options/options-list/options-list.component';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

@Component({
  selector: 'app-commandline',
  imports: [
    FormsModule,
    StatusBarComponent,
    OptionsListComponent,
    ToggleCardComponent,
    ReactiveFormsModule,
    RouterLink,
    SparkleFormFieldComponent,
    SparkleButtonComponent,
    SparkleDividerComponent,
    SparkleSelectComponent,
    SparkleProgressBarComponent,
    SparkleIconComponent,
  ],
  templateUrl: './commandline.component.html',
  styleUrl: './commandline.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class CommandlineComponent {
  #backupState = inject(BackupState);
  #dupServer = inject(DuplicatiServerService);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #commandline = inject(CommandlineService);
  #statusBarState = inject(StatusBarState);
  #dialog = inject(SparkleDialogService);

  #routeParamsSignal = toSignal(this.#route.params);
  commandOptions = toSignal(this.#commandline.getApiV1Commandline());
  sizeOptions = signal<string[]>(SIZE_OPTIONS as any);
  isSubmitting = signal(false);
  optionsFields = this.#backupState.optionsFields;

  standardFields = fb.group({
    'backup-id': fb.control(''),
    'backup-name': fb.control(''),
    dbpath: fb.control(''),
    filters: fb.array<string>([]),
  });

  baseCmdForm = fb.group({
    command: fb.control('backup'),
    targetUrl: fb.control(''),
    arguments: fb.control(''),
  });

  finishedLoading = this.#backupState.finishedLoading;
  backupId = this.#backupState.backupId;
  settings = this.#backupState.settings;

  #e = effect(() => {
    const backupId = this.#routeParamsSignal()?.['id'];

    this.#backupState.backupId.set(backupId);
    this.getBackup(backupId);
  });

  getBackup(id: string) {
    this.#dupServer
      .getApiV1BackupById({
        id,
      })
      .subscribe({
        next: (res: GetBackupResultDto) => {
          this.#backupState.mapScheduleToForm(res.Schedule ?? null);

          if (res.Backup) {
            this.#backupState.mapGeneralToForm(res.Backup);
            this.mapStandardFieldsToForm(res.Backup);
            this.mapBaseCmdToForm(res.Backup);
            this.#backupState.mapOptionsToForms(res.Backup);
          }

          this.#backupState.finishedLoading.set(true);
        },
      });
  }

  mapStandardFieldsToForm(backup: BackupDto) {
    this.standardFields.patchValue({
      dbpath: backup.DBPath,
      'backup-id': backup.ID,
      'backup-name': backup.Name,
    });

    if (backup.Filters && backup.Filters.length) {
      backup.Filters.map((x) => {
        this.standardFields.controls.filters.push(fb.control(`${x.Include ? '' : '-'}${x.Expression}`));
      });
    }
  }

  submit() {
    this.#statusBarState.resumeDialogCheck(() => this.#submit());
  }

  #submit() {
    this.isSubmitting.set(true);
    const baseCmd = this.baseCmdForm.value;
    const targetUrl = baseCmd.targetUrl ?? '';
    const baseArgs = baseCmd.arguments?.split('\n').filter((y) => y.length > 0) ?? [];
    const stdForm = this.standardFields.value;
    const filters = stdForm.filters ?? ([] as string[]);

    const command = [
      baseCmd.command!,
      targetUrl,
      ...baseArgs,
      `--backup-name=${stdForm['backup-name']}`,
      `--dbpath=${stdForm.dbpath}`,
      `--backup-id=${stdForm['backup-id']}`,
      ...filters.filter((x) => x).map((x) => (x!.startsWith('-') ? `--exclude=${x?.slice(1)}` : `--include=${x}`)),
      ...this.#backupState
        .mapFormsToSettings(['backup-id', 'backup-name', 'dbpath'])
        .map((x) => `${x.Name.startsWith('--') ? '' : '--'}${x.Name}=${x.Value}`),
      '--disable-module=console-password-input',
    ];

    this.#dupServer
      .postApiV1Commandline({
        requestBody: command,
      })
      .subscribe((response) => {
        if (response.Status === 'OK') {
          this.#router.navigate(['backup', this.backupId(), 'commandline', response.ID]);
        }
      });
  }

  mapBaseCmdToForm(backup: BackupDto) {
    const targetBaseUrl = backup.TargetURL ?? null;

    if (!targetBaseUrl) return;

    this.baseCmdForm.patchValue({
      targetUrl: targetBaseUrl ?? '',
      arguments: backup.Sources?.join('\n') ?? '',
    });
  }
}
