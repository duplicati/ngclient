import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
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
import { DuplicatiServerService, GetApiV1BackupByIdFilesData, TreeNodeDto } from '../../core/openapi';
import { BytesPipe } from '../../core/pipes/byte.pipe';
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

  // Prevent effects from hammering the API
  #requestedRootPathLoadId: string | null = null;
  #requestedRepairVersion: string | null = null;

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
  isRepairing = signal(false);
  loadedVersions = signal<{[key: string]: boolean }>({});

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
      this.isRepairing.set(true);
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

          // Maybe listen for status bar instead of polling since it knows when the task is done
          var timerId = window.setInterval(() => {
            this.#dupServer.getApiV1TaskByTaskid({ taskid: taskId }).subscribe((r2) => {
              if (r2.Status === 'Completed') {
                clearInterval(timerId);
                this.isRepairing.set(false);
                this.loadedVersions.update((x) => {
                  x[versionId] = true;
                  return x;
                });                
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

              // The roots may include more than absolute root paths, so we need to split them
              // into roots and descendants to avoid showing too many root nodes in the tree.
              const { roots, descendants } = this.splitRootsAndDescendants(paths);
              this.initialNodes.set(descendants.map((path) => {
                const label = path.replace(/[\\/]+$/, '') // strip trailing slash
                  .split(/[\\/]/)
                  .filter(Boolean)
                  .pop() || path;

                const node: TreeNodeDto = {
                  id: path,
                  leaf: false,
                  cls: 'folder',
                  text: label,
                  iconCls: 'folder',
                  fileSize: -1
                };
                return node;
              }));                       
              this.rootPaths.set(roots);
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

  splitRootsAndDescendants(paths: string[]): { roots: string[], descendants: string[] } {
    const normalized = paths.map(p => p.replace(/[/\\]+$/, '\\').toLowerCase());
  
    const roots: string[] = [];
    const descendants: string[] = [];
  
    for (let i = 0; i < normalized.length; i++) {
      const current = normalized[i];
      const isDescendant = normalized.some((other, j) =>
        i !== j && current.startsWith(other) && current !== other
      );
  
      if (isDescendant) {
        descendants.push(paths[i]); // preserve original case
      } else {
        roots.push(paths[i]);
      }
    }
  
    return { roots, descendants };
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
