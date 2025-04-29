import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleIconComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { finalize, Subject, takeUntil } from 'rxjs';
import FileTreeComponent, { BackupSettings } from '../../core/components/file-tree/file-tree.component';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { DuplicatiServerService, GetApiV1BackupByIdFilesData } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
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
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    FileTreeComponent,
    SparkleButtonComponent,
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
  #sysinfo = inject(SysinfoState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #datePipe = inject(DatePipe);
  #statusbarState = inject(StatusBarState);

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
  rootPath = signal<string | undefined>(undefined);
  loadingRootPath = signal(false);
  isRepairing = signal(false);
  requestedRootPathLoadId = signal<string | null>(null);

  loadingEffect = effect(() => {
    const versionOptionsLoading = this.versionOptionsLoading();

    if (versionOptionsLoading) return;

    const versionOptions = this.versionOptions();

    if (versionOptions && versionOptions?.length > 0) {
      const firstOption = versionOptions[0].Version;

      if (Number.isInteger(firstOption)) {
        this.selectFilesForm.controls.selectedOption.setValue(firstOption!);
      }
    }
  });

  backupSettingsEffect = effect(() => {
    const id = this.backupId();
    const isRepairing = this.isRepairing();
    const newOption =
      typeof this.selectOptionSignal() === 'string'
        ? parseInt(this.selectOptionSignal() as any)
        : this.selectOptionSignal();

    if (!(typeof newOption === 'number') || !id) return;

    const option = this.versionOptions()?.find((x) => x.Version === newOption);
    const time = option?.Time ?? null;

    if (!time || isRepairing) return;

    this.showFileTree.set(false);

    if (this.requestedRootPathLoadId() !== id + '') {
      this.requestedRootPathLoadId.set(id + '');
      queueMicrotask(() => {
        const settings = {
          id: id + '',
          time,
        } as BackupSettings;
        this.backupSettings.set(settings);
        this.getRootPath(settings);
      });
    }
  });

  repairEffect = effect(() => {
    const isDraft = this.#restoreFlowState.isDraft();
    const newSelectedOption = this.selectOptionSignal();
    const versionOptions = this.versionOptions();

    if (isDraft && newSelectedOption) {
      const option = versionOptions.find((x) => x.Version === parseInt(newSelectedOption as any));

      if (option === undefined) return;

      const backupId = this.backupId();

      this.isRepairing.set(true);
      this.#dupServer
        .postApiV1BackupByIdRepairupdate({
          id: backupId!,
          requestBody: {
            only_paths: true,
            time: option.Time,
          },
        })
        .subscribe((res) => {
          const taskId = res.ID!;

          // Maybe listen for status bar instead of polling since it knows when the task is done
          var timerId = window.setInterval(() => {
            this.#dupServer.getApiV1TaskByTaskid({ taskid: taskId }).subscribe((r2) => {
              if (r2.Status === 'Completed') {
                clearInterval(timerId);
                this.isRepairing.set(false);
              }
            });
          }, 1000);
        });
    }
  });

  getRootPath(backupSettings: BackupSettings) {
    const params: GetApiV1BackupByIdFilesData = {
      id: backupSettings.id + '',
      time: backupSettings.time,
      prefixOnly: true,
      folderContents: false,
    };

    if (this.isRepairing()) return;

    this.loadingRootPath.set(true);
    if (this.#sysinfo.hasV2ListOperations()) {
      this.#dupServer
        .postApiV2BackupListFolder({
          requestBody: {
            BackupId: backupSettings.id,
            Time: backupSettings.time,
            Paths: null,
            PageSize: 10000,
            Page: 0
          }}
        )
        .pipe(
          takeUntil(this.abortLoading$),
          finalize(() => {
            this.showFileTree.set(true);
            this.loadingRootPath.set(false);
          })
        )
        .subscribe({
          next: (res) => {
            if (res.Error)
              throw new Error(res.Error);
            
          // TODO: Handle folders larger than 10000
            const paths = (res.Data ?? []).map((x) => x.Path);
            if (paths.length == 1)
              this.rootPath.set(paths[0] ?? '/');
            else
              this.rootPath.set(''); // Handle multiple roots by treating the root as empty
          },
        });

    } else {
      this.#dupServer
        .getApiV1BackupByIdFiles(params)
        .pipe(
          takeUntil(this.abortLoading$),
          finalize(() => {
            this.showFileTree.set(true);
            this.loadingRootPath.set(false);
          })
        )
        .subscribe({
          next: (res) => {
            const paths = ((res as any)['Files'] as any[]).map((x) => x.Path);
            if (paths.length == 1)
              this.rootPath.set(paths[0] ?? '/');
            else
              this.rootPath.set(''); // Handle multiple roots by treating the root as empty
          },
        });
    }
  }

  abortLoading$ = new Subject();
  abortLoading() {
    this.showFileTree.set(false);
    this.loadingRootPath.set(false);
    this.abortLoading$.next(true);
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
