import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleDividerComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { BackupDto, CommandlineService, DuplicatiServerService, GetBackupResultDto } from '../../core/openapi';
import { BackupState } from '../backup.state';
import { FormView } from '../destination/destination.config-utilities';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;

@Component({
  selector: 'app-commandline',
  imports: [
    StatusBarComponent,
    FileTreeComponent,
    ToggleCardComponent,
    ReactiveFormsModule,
    NgTemplateOutlet,
    RouterLink,
    SparkleFormFieldComponent,
    SparkleMenuComponent,
    SparkleButtonComponent,
    SparkleToggleComponent,
    SparkleDividerComponent,
    SparkleTooltipComponent,
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

  #routeParamsSignal = toSignal(this.#route.params);
  commandOptions = toSignal(this.#commandline.getApiV1Commandline());
  sizeOptions = signal<string[]>(SIZE_OPTIONS as any);
  isSubmitting = signal(false);

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
  optionsForm = this.#backupState.optionsForm;
  selectedOptions = this.#backupState.selectedOptions;
  nonSelectedOptions = this.#backupState.nonSelectedOptions;
  finishedLoading = this.#backupState.finishedLoading;
  backupId = this.#backupState.backupId;

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
    this.isSubmitting.set(true);
    const baseCmd = this.baseCmdForm.value;
    const optionsForm = this.optionsForm.value;
    const targetUrl = baseCmd.targetUrl ?? '';
    const baseArgs = baseCmd.arguments?.split('\n') ?? [];
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
        .mapFormsToSettings()
        .map((x) => (x.Name!.startsWith('--') ? `${x.Name}=${x.Value}` : `--${x.Name}=${x.Value}`)),
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

  oauthStartTokenCreation(_: any) {}
  getFormFieldValue(
    destinationIndex: number,
    formGroupName: 'custom' | 'dynamic' | 'advanced',
    formControlName: string
  ) {
    const group = this.optionsForm.controls.advancedOptions as any;

    return group.controls[formControlName].value;
  }

  removeFormView(option: FormView, _: any) {
    this.#backupState.removeOptionFromFormGroup(option);
  }

  addNewOption(option: FormView) {
    this.#backupState.addOptionToFormGroup(option);
  }
}
