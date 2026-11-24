import { disabled, form, FormField } from '@angular/forms/signals';
import { NullableTextControl } from '../general/nullable-text-control';
import { DatePipe, DecimalPipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { defer, EMPTY, expand, last, map, Observable, Subscription, switchMap, timer } from 'rxjs';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { CommandLineLogOutputDto, DuplicatiServer, IListResultFileset } from '../../core/openapi';
import {
  buildCompareCommand,
  CompareChange,
  CompareChangeType,
  CompareResult,
  parseCompareOutput,
} from './compare-output';

type VersionOption = IListResultFileset & { Version: number };

type CompareState =
  | { status: 'idle' }
  | { status: 'queued' | 'running'; base: number; target: number }
  | { status: 'done'; base: number; target: number; result: CompareResult }
  | { status: 'failed'; base: number; target: number; message: string; output: string[] };

const OUTPUT_PAGE_SIZE = 1000;
const POLL_INTERVAL_MS = 1000;
// Rows added to the list at a time, so that a comparison with very many changes stays responsive
const CHANGES_PAGE_SIZE = 500;

const CHANGE_TYPES: { type: CompareChangeType; label: string; marker: string }[] = [
  { type: 'added', label: $localize`Added`, marker: '+' },
  { type: 'modified', label: $localize`Modified`, marker: '~' },
  { type: 'deleted', label: $localize`Deleted`, marker: '−' },
];

@Component({
  selector: 'app-compare-versions',
  imports: [
    FormField,
    NullableTextControl,
    ShipButton,
    ShipFormField,
    ShipIcon,
    ShipProgressBar,
    ShipSelect,
    DatePipe,
    DecimalPipe,
  ],
  templateUrl: './compare-versions.component.html',
  styleUrl: './compare-versions.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CompareVersionsComponent {
  #dupServer = inject(DuplicatiServer);
  #statusBarState = inject(StatusBarState);
  #router = inject(Router);

  id = input.required<string>();
  // The versions to compare right away, given by a link such as the one on a backup's log entry
  base = input<string>();
  target = input<string>();

  changeTypes = CHANGE_TYPES;
  typeDisplay = Object.fromEntries(CHANGE_TYPES.map((x) => [x.type, x])) as Record<
    CompareChangeType,
    (typeof CHANGE_TYPES)[number]
  >;

  backupResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => defer(() => this.#dupServer.getApiV1BackupById({ path: { id: params.id } })),
  });
  versionsResource = rxResource({
    params: () => ({ id: this.id() }),
    stream: ({ params }) => defer(() => this.#dupServer.getApiV1BackupByIdFilesets({ path: { id: params.id } })),
  });

  backup = computed(() => (this.backupResource.hasValue() ? (this.backupResource.value().Backup ?? null) : null));
  isLoading = computed(() => this.backupResource.isLoading() || this.versionsResource.isLoading());
  loadFailed = computed(() => !!this.backupResource.error() || !!this.versionsResource.error());

  // Newest first, which is version 0
  versions = computed((): VersionOption[] =>
    (this.versionsResource.hasValue() ? this.versionsResource.value() : [])
      .filter((x): x is VersionOption => x.Version != null)
      .sort((a, b) => a.Version - b.Version)
  );

  // The selects hold the version number as text
  baseVersion = signal('');
  targetVersion = signal('');
  #selection = computed(() => {
    const find = (value: string) => this.versions().find((x) => `${x.Version}` === `${value}`) ?? null;
    return { base: find(this.baseVersion()), target: find(this.targetVersion()) };
  });
  canCompare = computed(() => {
    const { base, target } = this.#selection();
    return !!this.backup() && !!base && !!target && base.Version !== target.Version;
  });
  sameVersion = computed(() => {
    const { base, target } = this.#selection();
    return !!base && !!target && base.Version === target.Version;
  });

  state = signal<CompareState>({ status: 'idle' });
  isComparing = computed(() => ['queued', 'running'].includes(this.state().status));
  baseVersionField = form(this.baseVersion, (field) => disabled(field, () => this.isComparing()));
  targetVersionField = form(this.targetVersion, (field) => disabled(field, () => this.isComparing()));
  // The versions of the comparison shown, which stay as they are when the selects are changed afterwards
  compared = computed(() => {
    const state = this.state();
    if (state.status === 'idle') return null;
    const find = (version: number) => this.versions().find((x) => x.Version === version) ?? { Version: version };
    return { base: find(state.base), target: find(state.target) };
  });
  result = computed(() => {
    const state = this.state();
    return state.status === 'done' ? state.result : null;
  });

  inputForm = form(signal({ filter: '' }));
  filter = this.inputForm.filter().value;
  hiddenTypesField = form(signal<ReadonlySet<CompareChangeType>>(new Set()));
  hiddenTypes = this.hiddenTypesField().value;
  limit = signal(CHANGES_PAGE_SIZE);

  changeCounts = computed(() => {
    const counts: Record<CompareChangeType, number> = { added: 0, modified: 0, deleted: 0 };
    for (const change of this.result()?.changes ?? []) counts[change.type]++;
    return counts;
  });
  filteredChanges = computed((): CompareChange[] => {
    const filter = this.filter().trim().toLowerCase();
    const hidden = this.hiddenTypes();
    return (this.result()?.changes ?? []).filter(
      (x) => !hidden.has(x.type) && (filter === '' || x.path.toLowerCase().includes(filter))
    );
  });
  visibleChanges = computed(() => this.filteredChanges().slice(0, this.limit()));

  #run?: Subscription;
  // The command being run on the server, which is aborted when its result is no longer wanted
  #runId: string | null = null;
  #initializedFor: string | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.#cancel());

    // Another backup's comparison is not shown for this one
    effect((onCleanup) => {
      this.id();
      onCleanup(() => {
        this.#cancel();
        this.state.set({ status: 'idle' });
      });
    });

    // Selects the versions once they are known: those of the link, which are compared right away,
    // or else the newest version and the one before it
    effect(() => {
      const id = this.id();
      const versions = this.versions();
      if (!this.backup() || versions.length === 0 || this.#initializedFor === id) return;

      const has = (value: string | undefined): value is string => versions.some((x) => `${x.Version}` === value);
      const base = this.base();
      const target = this.target();
      const linked = has(base) && has(target) && base !== target;
      // Right after the page loads the server's state is not known yet, and would be taken for paused
      if (linked && !this.#statusBarState.serverState()) return;
      this.#initializedFor = id;

      untracked(() => {
        if (linked) {
          this.baseVersion.set(base);
          this.targetVersion.set(target);
          this.compare();
          return;
        }

        this.targetVersion.set(`${versions[0].Version}`);
        this.baseVersion.set(`${(versions[1] ?? versions[0]).Version}`);
      });
    });
  }

  compare() {
    if (!this.canCompare()) return;
    this.#statusBarState.resumeDialogCheck(() => this.#compare());
  }

  #compare() {
    const backup = this.backup();
    const { base, target } = this.#selection();
    if (!backup || !base || !target) return;

    this.#cancel();
    this.filter.set('');
    this.hiddenTypes.set(new Set());
    this.limit.set(CHANGES_PAGE_SIZE);

    const versions = { base: base.Version, target: target.Version };
    this.state.set({ status: 'queued', ...versions });
    // Keeps the comparison in the address, so that it can be reloaded and linked to
    this.#router.navigate([], { queryParams: versions, queryParamsHandling: 'merge', replaceUrl: true });

    this.#run = defer(() =>
      this.#dupServer.postApiV1Commandline({ body: buildCompareCommand(backup, base.Version, target.Version) })
    )
      .pipe(
        switchMap((started) => {
          if (started.Status !== 'OK' || !started.ID) throw new Error($localize`The server did not start the command.`);
          this.#runId = started.ID;
          return this.#readOutput(started.ID, () => this.state.set({ status: 'running', ...versions }));
        })
      )
      .subscribe({
        next: (output) => {
          this.#runId = null;
          const result = parseCompareOutput(output);
          this.state.set(
            result
              ? { status: 'done', ...versions, result }
              : { status: 'failed', ...versions, message: $localize`The versions could not be compared.`, output }
          );
        },
        error: (error) => {
          this.state.set({
            status: 'failed',
            ...versions,
            message: (error as { message?: string })?.message ?? $localize`The versions could not be compared.`,
            output: [],
          });
        },
      });
  }

  // Emits the complete output of a command once it has finished
  #readOutput(runId: string, started: () => void): Observable<string[]> {
    const output: string[] = [];
    let offset = 0;
    const read = () =>
      defer(() =>
        this.#dupServer.getApiV1CommandlineByRunid({
          path: { runid: runId },
          query: { offset, pagesize: OUTPUT_PAGE_SIZE },
        })
      );

    return read().pipe(
      expand((response: CommandLineLogOutputDto) => {
        const items = response.Items ?? [];
        output.push(...items);
        offset = (response.Offset ?? offset) + items.length;
        if (response.Started) started();

        const caughtUp = offset >= (response.Count ?? offset);
        if (response.Started && response.Finished && caughtUp) return EMPTY;

        // More output is waiting when the page is full, so it is read without a pause
        const isFullPage = items.length > 0 && items.length >= (response.Pagesize ?? OUTPUT_PAGE_SIZE);
        return isFullPage && !caughtUp ? read() : timer(POLL_INTERVAL_MS).pipe(switchMap(read));
      }),
      last(),
      map(() => output)
    );
  }

  #cancel() {
    this.#run?.unsubscribe();
    this.#run = undefined;

    const runId = this.#runId;
    this.#runId = null;
    if (runId === null) return;

    // The run may have finished already, in which case there is nothing to abort
    defer(() => this.#dupServer.postApiV1CommandlineByRunidAbort({ path: { runid: runId } })).subscribe({
      error: () => {},
    });
  }

  cancel() {
    this.#cancel();
    this.state.set({ status: 'idle' });
  }

  swapVersions() {
    const base = this.baseVersion();
    this.baseVersion.set(this.targetVersion());
    this.targetVersion.set(base);
  }

  toggleType(type: CompareChangeType) {
    this.hiddenTypes.update((hidden) => {
      const next = new Set(hidden);
      if (!next.delete(type)) next.add(type);
      return next;
    });
    this.limit.set(CHANGES_PAGE_SIZE);
  }

  updateFilter(value: string) {
    this.filter.set(value);
    this.resetFilterLimit();
  }

  resetFilterLimit() {
    this.limit.set(CHANGES_PAGE_SIZE);
  }

  showMore() {
    this.limit.update((x) => x + CHANGES_PAGE_SIZE);
  }

  totalCount(type: CompareChangeType): number {
    const totals = this.result()?.totals[type];
    return totals ? totals.files + totals.folders + totals.symlinks : 0;
  }
}
