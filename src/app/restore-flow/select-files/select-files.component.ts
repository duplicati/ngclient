import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleIconComponent,
  SparkleOptionComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import FileTreeComponent, { BackupSettings } from '../../core/components/file-tree/file-tree.component';
import { DuplicatiServerService, GetApiV1BackupByIdFilesData } from '../../core/openapi';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreSelectFilesForm = () => {
  return fb.group({
    filesToRestore: fb.control<string>(''),
    selectedOption: fb.control<number | null>(null),
    passphrase: fb.control<string | null>(null),
  });
};

@Component({
  selector: 'app-select-files',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    FileTreeComponent,
    SparkleButtonComponent,
    SparkleOptionComponent,
    SparkleIconComponent,
    SparkleSelectComponent,
    SparkleProgressBarComponent,
  ],
  templateUrl: './select-files.component.html',
  styleUrl: './select-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe],
})
export default class SelectFilesComponent {
  #dupServer = inject(DuplicatiServerService);
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #datePipe = inject(DatePipe);

  selectFilesForm = this.#restoreFlowState.selectFilesForm;
  selectFilesFormSignal = this.#restoreFlowState.selectFilesFormSignal;
  selectOptionSignal = this.#restoreFlowState.selectOptionSignal;
  backupId = this.#restoreFlowState.backupId;
  versionOptionsLoading = this.#restoreFlowState.versionOptionsLoading;
  versionOptions = this.#restoreFlowState.versionOptions;
  isDraft = this.#restoreFlowState.isDraft;
  isFileRestore = this.#restoreFlowState.isFileRestore;

  showFileTree = signal<boolean>(false);
  backupSettings = signal<BackupSettings | null>(null);

  backupSettingsEffect = effect(() => {
    const id = this.backupId();
    const newOption =
      typeof this.selectOptionSignal() === 'string'
        ? parseInt(this.selectOptionSignal() as any)
        : this.selectOptionSignal();

    if (!(typeof newOption === 'number') || !id) return;

    const option = this.versionOptions()?.find((x) => x.Version === newOption);
    const time = option?.Time ?? null;

    if (!time) return;

    this.showFileTree.set(false);

    setTimeout(() => {
      const settings = {
        id: id + '',
        time,
      } as BackupSettings;
      this.backupSettings.set(settings);
      this.getRootPath(settings);
    });
  });

  rootPath = signal<string | undefined>(undefined);
  loadingRootPath = signal(false);
  getRootPath(backupSettings: BackupSettings) {
    const params: GetApiV1BackupByIdFilesData = {
      id: backupSettings.id + '',
      time: backupSettings.time,
      prefixOnly: true,
      folderContents: false,
    };

    this.loadingRootPath.set(true);
    this.#dupServer
      .getApiV1BackupByIdFiles(params)
      .pipe(
        finalize(() => {
          this.showFileTree.set(true);
          this.loadingRootPath.set(false);
        })
      )
      .subscribe({
        next: (res) => {
          const path = (res as any)['Files'][0].Path;
          // console.log(res, path);
          this.rootPath.set(path);
        },
      });
  }

  isRepairing = signal(false);
  repairEffect = effect(() => {
    const isDraft = this.#restoreFlowState.isDraft();
    const newSelectedOption = this.selectOptionSignal();

    if (isDraft && newSelectedOption) {
      const backupId = this.backupId();

      this.isRepairing.set(true);
      this.#dupServer
        .postApiV1BackupByIdRepairupdate({
          id: backupId!,
          requestBody: {
            only_paths: true,
            time: new Date().toISOString(),
          },
        })
        .pipe(finalize(() => this.isRepairing.set(false)))
        .subscribe();
    }
  });

  abortLoading() {
    this.selectFilesForm.controls.selectedOption.setValue(null);
  }

  displayFn() {
    const options = this.versionOptions();

    return (val: string) => {
      if (!val) return '';

      const item = options?.find((x) => {
        return typeof x.Version === 'number' && x.Version.toString() === val;
      });

      if (!item) {
        return '';
      }

      return `${item.Version}: ${this.#datePipe.transform(item.Time, 'medium')}`;
    };
  }

  next() {
    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }

  back() {
    if (this.#restoreFlowState.isFileRestore()) {
      this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
    } else {
      this.#restoreFlowState.exit();
    }
  }
}
