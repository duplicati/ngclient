import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButtonComponent, ShipIconComponent, ShipProgressBarComponent, ShipSelectComponent } from '@ship-ui/core';
import { finalize, Subject, take, takeUntil } from 'rxjs';
import FileTreeComponent, { BackupSettings } from '../../core/components/file-tree/file-tree.component';
import { DuplicatiServer, GetApiV1BackupByIdFilesData, TreeNodeDto } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
import { ServerStateService } from '../../core/services/server-state.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreSelectFilesForm = () => {
  return fb.group({
    filesToRestore: fb.control<string>(''),
    passphrase: fb.control<string | null>(null),
  });
};

@Component({
  selector: 'app-select-files',
  imports: [
    FormsModule,
    ReactiveFormsModule,
    DatePipe,
    BytesPipe,
    FileTreeComponent,
    ShipButtonComponent,
    ShipIconComponent,
    ShipSelectComponent,
    ShipProgressBarComponent,
  ],
  templateUrl: './select-files.component.html',
  styleUrl: './select-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe],
})
export default class SelectFilesComponent {
  #dupServer = inject(DuplicatiServer);
  #restoreFlowState = inject(RestoreFlowState);
  #serverState = inject(ServerStateService);
  #sysinfo = inject(SysinfoState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #datePipe = inject(DatePipe);

  // Prevent effects from hammering the API
  #requestedRootPathLoadId: string | null = null;
  #requestedRepairVersion: string | null = null;

  #activeRepairIds = signal<string[]>([]);

  selectFilesForm = this.#restoreFlowState.selectFilesForm;
  selectFilesFormSignal = this.#restoreFlowState.selectFilesFormSignal;
  selectOption = this.#restoreFlowState.selectOption;
  backupId = this.#restoreFlowState.backupId;
  versionOptionsLoading = this.#restoreFlowState.versionOptionsLoading;
  versionOptions = this.#restoreFlowState.versionOptions;
  isFileRestore = this.#restoreFlowState.isFileRestore;

  needsDatabaseRepair = computed(() => this.#restoreFlowState.backup()?.Backup?.IsTemporary ?? true);
  showFileTree = signal<boolean>(false);
  backupSettings = signal<BackupSettings | null>(null);
  rootPaths = signal<string[]>([]);
  initialNodes = signal<TreeNodeDto[]>([]);
  loadingRootPath = signal(false);
  isRepairing = computed(() => this.#activeRepairIds().length > 0);
  loadedVersions = signal<{ [key: string]: boolean }>({});

  loadingEffect = effect(() => {
    const versionOptionsLoading = this.versionOptionsLoading();

    if (versionOptionsLoading) return;

    const versionOptions = this.versionOptions();

    if (versionOptions && versionOptions?.length > 0) {
      const firstOption = versionOptions[0].Version;

      this.selectOption.set(firstOption.toString());
    }
  });

  backupSettingsEffect = effect(() => {
    const id = this.backupId();
    const newOption = this.selectOption();
    const isRepairing = this.isRepairing();
    const loadedVersions = this.loadedVersions();

    if (!newOption || !id) return;

    const option = this.versionOptions()?.find((x) => x.Version === parseInt(newOption));
    const time = option?.Time ?? null;

    if (!time) return;
    const versionId = `${id}+${time}`;
    const isVersionLoaded = loadedVersions[versionId];

    if (this.needsDatabaseRepair() && (!isVersionLoaded || isRepairing)) return;

    const settings = {
      id: id + '',
      time,
    } as BackupSettings;

    this.backupSettings.set(settings);
    this.getRootPath(settings);
  });

  repairEffect = effect(() => {
    if (!this.needsDatabaseRepair()) return;

    const newSelectedOption = this.selectOption();
    const versionOptions = this.versionOptions();

    if (newSelectedOption) {
      const option = versionOptions.find((x) => x.Version === parseInt(newSelectedOption as any));

      if (option === undefined) return;

      const backupId = this.backupId();
      const versionId = `${backupId}+${option.Time}`;

      if (this.#requestedRepairVersion === versionId) return;

      this.#requestedRepairVersion = versionId;
      if (this.#activeRepairIds().includes(versionId)) return;
      this.#activeRepairIds.update((ids) => {
        return [...ids, versionId];
      });

      this.#dupServer
        .postApiV1BackupByIdRepairupdate({
          id: backupId!,
          requestBody: {
            only_paths: true,
            time: option.Time,
          },
        })
        .pipe(
          takeUntil(this.abortLoading$),
          finalize(() => {
            this.#requestedRepairVersion = null;
          })
        )
        .subscribe((res) => {
          const taskId = res.ID!;
          this.#serverState
            .waitForTaskToComplete(taskId)
            .pipe(take(1))
            .subscribe(() => {
              this.#activeRepairIds.update((ids) => {
                return ids.filter((x) => x !== versionId);
              });
              this.loadedVersions.update((x) => {
                x[versionId] = true;
                return x;
              });
            });
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

    const requestId = backupSettings.id + '';
    if (this.isRepairing() || this.#requestedRootPathLoadId === requestId) return;

    this.#requestedRootPathLoadId = requestId;
    this.loadingRootPath.set(true);
    this.showFileTree.set(false);

    if (this.#sysinfo.hasV2ListOperations()) {
      this.#dupServer
        .postApiV2BackupListFolder({
          requestBody: {
            BackupId: backupSettings.id,
            Time: backupSettings.time,
            Paths: null,
            PageSize: 0, // TODO: Add pagination support
            Page: 0,
          },
        })
        .pipe(
          takeUntil(this.abortLoading$),
          finalize(() => {
            this.showFileTree.set(true);
            this.loadingRootPath.set(false);
            this.#requestedRootPathLoadId = null;
          })
        )
        .subscribe({
          next: (res) => {
            const paths = (res.Data ?? []).map((x) => x.Path ?? '');
            if (paths.length > 0) {
              this.initialNodes.set([]);
              this.rootPaths.set(paths);
            } else {
              this.initialNodes.set([]);
              this.rootPaths.set(['/']);
            }
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
            const paths = ((res as any)['Files'] as any[]).map((x) => x.Path ?? '');

            if (paths.length > 0) {
              this.initialNodes.set([]);
              this.rootPaths.set(paths);
            } else {
              this.initialNodes.set([]);
              this.rootPaths.set(['/']);
            }
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
