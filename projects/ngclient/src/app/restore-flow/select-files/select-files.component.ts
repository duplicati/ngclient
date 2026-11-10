import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { defer, finalize, Subject, Subscription, take, takeUntil } from 'rxjs';
import FileTreeComponent, { BackupSettings } from '../../core/components/file-tree/file-tree.component';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { DuplicatiServer, SearchEntriesItemDto, TreeNodeDto } from '../../core/openapi';
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
    ShipButton,
    ShipFormField,
    ShipIcon,
    ShipSelect,
    ShipProgressBar,
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
  #dialog = inject(ShipDialogService);

  // Prevent effects from hammering the API
  #requestedRootPathLoadId: string | null = null;
  #requestedRepairVersion: string | null = null;

  #activeRepairIds = signal<string[]>([]);

  selectFilesForm = this.#restoreFlowState.selectFilesForm;
  selectFilesFormSignal = this.#restoreFlowState.selectFilesFormSignal;
  selectOption = this.#restoreFlowState.selectOption;
  backupId = this.#restoreFlowState.backupId;
  versionOptionsLoading = this.#restoreFlowState.versionOptionsLoading;
  waitingForBackup = this.#restoreFlowState.waitingForBackup;
  versionOptions = this.#restoreFlowState.versionOptions;
  isFileRestore = this.#restoreFlowState.isFileRestore;
  extendedDataType = this.#restoreFlowState.extendedDataType;

  isSync = computed(() => this.#restoreFlowState.backup()?.Backup?.OperationType === 'Sync');
  // A Sync job is browsed on its destination, so there is no database to rebuild first
  needsDatabaseRepair = computed(
    () => !this.isSync() && (this.#restoreFlowState.backup()?.Backup?.IsTemporary ?? true)
  );
  showFileTree = signal<boolean>(false);
  backupSettings = signal<BackupSettings | null>(null);
  rootPaths = signal<string[]>([]);
  initialNodes = signal<TreeNodeDto[]>([]);
  rootMetadata = signal<{ [path: string]: { [key: string]: string | null } | null | undefined }>({});
  // Hyper-V and MSSQL sources are restored as files, but have display names in the metadata
  hasVirtualSources = signal(false);
  loadingRootPath = signal(false);
  isRepairing = computed(() => this.#activeRepairIds().length > 0);
  loadedVersions = signal<{ [key: string]: boolean }>({});

  #searchSubscription?: Subscription;
  #searchContext: string | null = null;
  #destroySearch = inject(DestroyRef).onDestroy(() => this.#searchSubscription?.unsubscribe());

  searchAllVersions = signal(false);
  searchPage = signal(0);
  searchPages = signal(0);
  searchError = signal(false);
  unavailableVersion = signal(false);
  allVersionResults = computed(() => this.searchAllVersions() && this.isSearchMode());
  #currentSearchContext = computed(() =>
    JSON.stringify([this.backupId(), this.selectOption(), this.searchQuery().trim(), this.searchAllVersions()])
  );
  #invalidateSearch = effect(() => {
    const context = this.#currentSearchContext();
    untracked(() => {
      if (this.#searchContext !== null && this.#searchContext !== context) this.#resetSearch();
    });
  });

  // Search functionality
  canSearch = computed(() => this.#sysinfo.hasV2ListOperations() && !this.isSync());
  searchQuery = signal<string>('');
  isSearching = signal(false);
  searchResults = signal<SearchEntriesItemDto[]>([]);
  searchParentMetadata = signal<{ [path: string]: { [key: string]: string | null } }>({});
  hasSearched = signal(false);
  isSearchMode = computed(() => this.searchQuery().length > 0 && this.hasSearched());

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
      if (!backupId) return;
      untracked(() => this.#repairVersion(backupId, option.Time));
    }
  });

  #repairVersion(backupId: string, time: string) {
    const versionId = `${backupId}+${time}`;
    if (
      this.loadedVersions()[versionId] ||
      this.#requestedRepairVersion === versionId ||
      this.#activeRepairIds().includes(versionId)
    )
      return;
    this.#requestedRepairVersion = versionId;
    this.#activeRepairIds.update((ids) => {
      return [...ids, versionId];
    });

    defer(() =>
      this.#dupServer.postApiV1BackupByIdRepairupdate({
        path: { id: backupId! },
        body: {
          only_paths: true,
          time,
        },
      })
    )
      .pipe(
        takeUntil(this.abortLoading$),
        finalize(() => {
          if (this.#requestedRepairVersion === versionId) this.#requestedRepairVersion = null;
        })
      )
      .subscribe((res) => {
        const taskId = res.ID!;
        this.#serverState
          .waitForTaskToComplete(taskId)
          .pipe(take(1))
          .subscribe((task) => {
            this.#activeRepairIds.update((ids) => {
              return ids.filter((x) => x !== versionId);
            });
            if (this.#requestedRepairVersion === versionId) this.#requestedRepairVersion = null;
            if (task.Status === 'Completed' && task.ErrorMessage == null) {
              this.loadedVersions.update((versions) => ({ ...versions, [versionId]: true }));
            } else if (task.Status === 'Failed' || (task.Status === 'Completed' && task.ErrorMessage != null)) {
              this.#dialog.open(ConfirmDialogComponent, {
                data: {
                  title: $localize`Restore database repair failed`,
                  message: task.ErrorMessage || task.Exception || $localize`The restore database repair failed.`,
                  confirmText: $localize`Retry`,
                  cancelText: $localize`Cancel`,
                },
                closed: (retry: boolean) => {
                  if (!retry || this.backupId() !== backupId) return;
                  const selected = this.versionOptions().find(
                    (option) => option.Version.toString() === this.selectOption()
                  );
                  if (selected?.Time === time) this.#repairVersion(backupId, time);
                },
              });
            }
          });
      });
  }

  getRootPath(backupSettings: BackupSettings) {
    const params = {
      path: { id: backupSettings.id + '' },
      query: {
        time: backupSettings.time,
        'prefix-only': true,
        'folder-contents': false,
      },
    };

    const requestId = backupSettings.id + '';
    if (this.isRepairing() || this.#requestedRootPathLoadId === requestId) return;

    this.#requestedRootPathLoadId = requestId;
    this.loadingRootPath.set(true);
    this.showFileTree.set(false);

    if (this.#sysinfo.hasV2ListOperations()) {
      defer(() =>
        this.#dupServer.postApiV2BackupListFolder({
          body: {
            BackupId: backupSettings.id,
            Time: backupSettings.time,
            Paths: null,
            PageSize: 0, // TODO: Add pagination support
            Page: 0,
            ReturnExtended: true,
          },
        })
      )
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
            const extType = (res.Data ?? []).find(
              (x) => x.Metadata && x.Metadata['ExtType'] && x.Metadata['ExtType'].length > 0
            );
            if (extType) this.extendedDataType.set(extType.Metadata!['ExtType']);

            this.rootMetadata.set(Object.fromEntries((res.Data ?? []).map((x) => [x.Path ?? '', x.Metadata])));
            this.hasVirtualSources.set(
              (res.Data ?? []).some((x) => x.Metadata && (x.Metadata['hyperv:v'] || x.Metadata['mssql:v']))
            );

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
      defer(() => this.#dupServer.getApiV1BackupByIdFiles(params))
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
    if (this.allVersionResults()) return;
    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }

  back() {
    if (this.#restoreFlowState.isFileRestore()) {
      this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
    } else {
      this.#restoreFlowState.exit();
    }
  }

  performSearch(page = 0) {
    const query = this.searchQuery().trim();
    const backupSettings = this.backupSettings();
    const needsMetadata = (this.#restoreFlowState.extendedDataType() ?? '').length > 0 || this.hasVirtualSources();

    if (!query || !backupSettings) return;

    const option = this.versionOptions()?.find((x) => x.Version === parseInt(this.selectOption() ?? ''));
    const version = option?.Version;

    if (version === null || version === undefined) return;

    this.#searchSubscription?.unsubscribe();
    this.#searchContext = this.#currentSearchContext();
    const context = this.#searchContext;
    this.searchError.set(false);
    this.unavailableVersion.set(false);
    this.searchPage.set(page);
    if (page === 0) this.searchPages.set(0);
    this.isSearching.set(true);
    this.searchResults.set([]);
    this.searchParentMetadata.set({});
    this.hasSearched.set(true);

    this.#searchSubscription = defer(() =>
      this.#dupServer.postApiV2BackupSearch({
        body: {
          BackupId: backupSettings.id,
          Time: null,
          Version: this.searchAllVersions() ? null : [version],
          Filters: [query],
          Paths: null,
          PageSize: this.searchAllVersions() ? 100 : 1000,
          Page: page,
          ReturnExtended: needsMetadata,
          SearchMetadata: needsMetadata,
        },
      })
    )
      .pipe(
        takeUntil(this.abortLoading$),
        finalize(() => this.isSearching.set(false))
      )
      .subscribe({
        next: (res) => {
          if (context !== this.#currentSearchContext()) return;
          if (!res.Success) {
            this.searchError.set(true);
            return;
          }
          if (page === 0 || (res.PageInfo?.Pages ?? 0) > 0) this.searchPages.set(res.PageInfo?.Pages ?? 0);
          // Older servers do not return the metadata for the parent folders
          this.searchParentMetadata.set(res.ParentMetadata ?? {});
          this.searchResults.set(res.Data ?? []);
        },
        error: () => {
          if (context !== this.#currentSearchContext()) return;
          this.searchError.set(true);
          this.searchResults.set([]);
        },
      });
  }

  selectSearchResult(result: SearchEntriesItemDto) {
    if (!this.allVersionResults() || this.isSearching() || this.#searchContext !== this.#currentSearchContext()) return;
    if (!this.searchResults().includes(result) || !result.Path) return;
    // Version numbers are relative to the newest backup and can shift while searching.
    // Match the immutable backup timestamp instead of trusting the result's version number.
    const timestamp = Date.parse(result.Time);
    const option = this.versionOptions().find((x) => Number.isFinite(timestamp) && Date.parse(x.Time) === timestamp);
    if (!option) {
      this.unavailableVersion.set(true);
      return;
    }
    this.abortLoading$.next(true);
    this.selectOption.set(option.Version.toString());
    const path = result.IsDirectory && !/[\\/]$/.test(result.Path) ? result.Path + '/' : result.Path;
    this.selectFilesForm.controls.filesToRestore.setValue(path);
    this.clearSearch();
  }

  #resetSearch() {
    this.#searchSubscription?.unsubscribe();
    this.#searchContext = null;
    this.searchPages.set(0);
    this.searchPage.set(0);
    this.searchError.set(false);
    this.unavailableVersion.set(false);
    this.searchResults.set([]);
    this.searchParentMetadata.set({});
    this.hasSearched.set(false);
  }

  clearSearch() {
    this.#resetSearch();
    this.searchQuery.set('');
  }
}
