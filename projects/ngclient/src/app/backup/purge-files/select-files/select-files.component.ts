import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { defer, finalize } from 'rxjs';
import FileTreeComponent, { BackupSettings } from '../../../core/components/file-tree/file-tree.component';
import { DuplicatiServer, SearchEntriesItemDto } from '../../../core/openapi';
import { BytesPipe } from '../../../core/pipes/byte.pipe';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { PurgeFilesState } from '../purge-files.state';

@Component({
  selector: 'app-purge-select-files',
  imports: [
    FormsModule,
    DatePipe,
    FileTreeComponent,
    ShipButton,
    ShipFormField,
    ShipIcon,
    ShipProgressBar,
    ShipSelect,
    BytesPipe,
    RouterLink,
  ],
  templateUrl: './select-files.component.html',
  styleUrl: './select-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class PurgeSelectFilesComponent {
  #dupServer = inject(DuplicatiServer);
  #sysinfo = inject(SysinfoState);
  #state = inject(PurgeFilesState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  versions = this.#state.versions;
  isLoadingVersions = this.#state.isLoadingVersions;
  selectedVersion = this.#state.selectedVersion;
  selectedPaths = this.#state.selectedPaths;
  selectedPathsArray = this.#state.selectedPathsArray;

  backupSettings = signal<BackupSettings | null>(null);
  rootPaths = signal<string[]>([]);
  showFileTree = signal(false);
  loadingRootPath = signal(false);

  // Search functionality
  canSearch = computed(() => this.#sysinfo.hasV2ListOperations());
  searchQuery = signal('');
  isSearching = signal(false);
  searchResults = signal<SearchEntriesItemDto[]>([]);
  hasSearched = signal(false);
  isSearchMode = computed(() => this.searchQuery().length > 0 && this.hasSearched());

  versionEffect = effect(() => {
    const version = this.selectedVersion();
    if (version === null) return;

    const option = this.versions().find((x) => x.Version === parseInt(version));
    if (!option?.Time) return;

    const id = this.#state.backupId();
    if (!id) return;

    this.loadVersion({ id, time: option.Time });
  });

  onVersionChange(version: string) {
    this.selectedPaths.set('');
    this.clearSearch();
    this.selectedVersion.set(version);
  }

  loadVersion(backupSettings: BackupSettings) {
    this.loadingRootPath.set(true);
    this.showFileTree.set(false);
    this.backupSettings.set(backupSettings);

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
        finalize(() => {
          this.loadingRootPath.set(false);
          this.showFileTree.set(true);
        })
      )
      .subscribe({
        next: (res) => {
          const paths = (res.Data ?? []).map((x) => x.Path ?? '');
          this.rootPaths.set(paths.length > 0 ? paths : ['/']);
        },
      });
  }

  performSearch() {
    const query = this.searchQuery().trim();
    const backupSettings = this.backupSettings();

    if (!query || !backupSettings) return;

    const version = parseInt(this.selectedVersion() ?? '');
    if (Number.isNaN(version)) return;

    this.isSearching.set(true);
    this.searchResults.set([]);
    this.hasSearched.set(true);

    defer(() =>
      this.#dupServer.postApiV2BackupSearch({
        body: {
          BackupId: backupSettings.id,
          Time: null,
          Version: [version],
          Filters: [query],
          Paths: null,
          PageSize: 1000,
          Page: 0,
          ReturnExtended: false,
          SearchMetadata: false,
        },
      })
    )
      .pipe(finalize(() => this.isSearching.set(false)))
      .subscribe({
        next: (res) => {
          this.searchResults.set(res.Data ?? []);
        },
        error: () => {
          this.searchResults.set([]);
        },
      });
  }

  clearSearch() {
    this.searchQuery.set('');
    this.searchResults.set([]);
    this.hasSearched.set(false);
  }

  next() {
    if (this.selectedPathsArray().length === 0) return;

    this.#router.navigate(['../version-scope'], { relativeTo: this.#route });
  }
}
