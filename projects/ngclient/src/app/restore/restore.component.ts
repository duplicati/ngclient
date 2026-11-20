import { PreserveListFocusDirective } from '../core/directives/preserve-list-focus.directive';
import { KeyboardActionDirective } from '../core/directives/keyboard-action.directive';
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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, FormField } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCard } from '@ship-ui/core/ship-card';
import { ShipDivider } from '@ship-ui/core/ship-divider';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { defer, finalize } from 'rxjs';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { BackupAndScheduleOutputDto, DuplicatiServer, TargetUrlDto } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { RestoreDraftsState } from './restore-drafts.state';

@Component({
  selector: 'app-restore',
  imports: [
    PreserveListFocusDirective,
    KeyboardActionDirective,
    FormField,
    StatusBarComponent,
    ShipCard,
    ShipButton,
    ShipDivider,
    ShipFormField,
    ShipIcon,
    ShipProgressBar,
    RouterLink,
  ],
  templateUrl: './restore.component.html',
  styleUrl: './restore.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class RestoreComponent {
  #backupsState = inject(BackupsState);
  #dupServer = inject(DuplicatiServer);
  #router = inject(Router);
  #destroyRef = inject(DestroyRef);

  #sysinfo = inject(SysinfoState);
  #hasSyncRestore = this.#sysinfo.hasSyncRestore;
  #restoreDrafts = inject(RestoreDraftsState);
  copyingDestination = signal(false);
  secondaryDestinations = signal<Record<string, TargetUrlDto[] | 'loading' | 'error'>>({});
  hasRestoreDestination = computed(() =>
    (this.#sysinfo.systemInfo()?.APIExtensions ?? []).includes('v1:backup:copytotemp-destination')
  );

  loadSecondaryDestinations(id: string | null, isOpen: boolean) {
    if (!id || !isOpen || this.secondaryDestinations()[id] === 'loading') return;
    this.secondaryDestinations.update((current) => ({ ...current, [id]: 'loading' }));
    defer(() => this.#dupServer.getApiV1BackupById({ path: { id } }))
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: ({ Backup }) =>
          this.secondaryDestinations.update((current) => ({
            ...current,
            [id]: (Backup?.AdditionalTargetURLs ?? []).filter((destination) => destination.UrlKey),
          })),
        error: () => this.secondaryDestinations.update((current) => ({ ...current, [id]: 'error' })),
      });
  }

  destinationLabel(target: string | null, index: number) {
    const label = $localize`Secondary destination ${index + 1}:destinationNumber:`;
    if (!target) return label;
    try {
      const url = new URL(target);
      return `${label} — ${url.protocol}//${url.host}${url.pathname}`;
    } catch {
      return label;
    }
  }

  restoreFromDestination(id: string | null, destination: string | null) {
    if (!id || !destination || !this.hasRestoreDestination() || this.copyingDestination()) return;
    this.copyingDestination.set(true);
    defer(() => this.#dupServer.postApiV1BackupByIdCopytotemp({ path: { id }, query: { destination } }))
      .pipe(
        takeUntilDestroyed(this.#destroyRef),
        finalize(() => this.copyingDestination.set(false))
      )
      .subscribe({
        next: ({ ID }) => {
          if (!ID) return;
          this.#restoreDrafts.remember(ID);
          void this.#router.navigate(['/restore-draft', ID]);
        },
        // The HTTP interceptor displays the server error.
        error: () => {},
      });
  }

  /** Direct restores started earlier in this browser that the server still has */
  restoreDrafts = this.#restoreDrafts.drafts;

  #loadRestoreDrafts = effect(() => {
    if (this.#sysinfo.hasTemporaryBackupList()) untracked(() => this.#restoreDrafts.load());
  });

  // Servers that cannot restore a Sync job do not offer it
  backups = computed(() =>
    this.#hasSyncRestore()
      ? this.#backupsState.backups()
      : this.#backupsState.backups().filter((job) => job.Backup?.OperationType !== 'Sync')
  );
  backupsLoading = this.#backupsState.backupsLoading;
  searchForm = form(signal({ query: '' }));
  searchTerm = this.searchForm.query().value;
  showSearch = computed(() => this.backups().length > 3);
  filteredBackups = computed(() => {
    const backups = this.backups();
    const searchTerm = this.searchTerm().trim().toLowerCase();
    if (!this.showSearch() || !searchTerm) return backups;

    return backups.filter((x) => x.Backup?.Name?.toLowerCase().includes(searchTerm));
  });

  ngOnInit() {
    this.#backupsState.getBackups(true);
  }

  dismissRestoreDraft(id: string) {
    this.#restoreDrafts.forget(id);
  }

  restoreNow(backup: BackupAndScheduleOutputDto) {
    defer(() =>
      this.#dupServer.postApiV1BackupByIdRestore({
        path: { id: backup.Backup?.ID! },
        body: {
          // paths?: Array<(string)> | null;
          // passphrase?: (string) | null;
          // time?: (string) | null;
          // restore_path?: (string) | null;
          // overwrite?: (boolean) | null;
          // permissions?: (boolean) | null;
          // skip_metadata?: (boolean) | null;
        },
      })
    );
  }
}
