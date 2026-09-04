import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { defer } from 'rxjs';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { CommandLineLogOutputDto, DuplicatiServer } from '../../core/openapi';

type Status = 'starting' | 'started' | 'finished' | 'aborted';

const getErrorStatus = (error: unknown): number | undefined => {
  if (typeof error !== 'object' || error === null) return undefined;

  const errorWithStatus = error as { status?: unknown; error?: unknown };
  if (typeof errorWithStatus.status === 'number') return errorWithStatus.status;

  const nestedError = errorWithStatus.error;
  if (typeof nestedError !== 'object' || nestedError === null) return undefined;

  const nestedStatus = (nestedError as { status?: unknown }).status;
  return typeof nestedStatus === 'number' ? nestedStatus : undefined;
};

@Component({
  selector: 'app-commandline-result',
  imports: [StatusBarComponent, ShipIcon, ShipButton, RouterLink],
  templateUrl: './commandline-result.component.html',
  styleUrl: './commandline-result.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class CommandlineResultComponent implements OnDestroy {
  #dupServer = inject(DuplicatiServer);
  #route = inject(ActivatedRoute);
  #routeParamsSignal = toSignal(this.#route.params);
  #queryParamsSignal = toSignal(this.#route.queryParams);
  runId = computed(() => this.#routeParamsSignal()?.['runId']);
  stateId = computed(() => this.#queryParamsSignal()?.['state']);

  offset = signal<number>(0);
  status = signal<Status>('starting');
  messageLog = signal<string[]>([]);
  logOutput = viewChild.required<ElementRef<HTMLElement>>('logOutput');
  autoScrollEnabled = signal(true);

  scrollToBottomEffect = afterRenderEffect(() => {
    this.messageLog();

    if (!this.autoScrollEnabled()) return;

    const logOutput = this.logOutput().nativeElement;
    logOutput.scrollTop = logOutput.scrollHeight;
  });

  interval = setInterval(() => this.#poll(), 1000);

  #poll() {
    defer(() =>
      this.#dupServer.getApiV1CommandlineByRunid({
        path: { runid: this.runId()! },
        query: {
          offset: this.offset(),
          pagesize: 100,
        },
      })
    ).subscribe({
      next: (response) => {
        const items = response.Items ?? [];
        const nextOffset = (response.Offset ?? this.offset()) + items.length;

        this.messageLog.update((messages) => [...messages, ...items]);
        this.offset.set(nextOffset);
        this.evalStatus(response);
      },
      error: (error) => this.#handleError(error),
    });
  }

  evalStatus(res: CommandLineLogOutputDto) {
    if (res.Started !== true) return;

    const caughtUp = this.offset() >= (res.Count ?? this.offset());
    if (res.Finished === true && caughtUp) {
      this.status.set('finished');
      this.#stopPolling();
      return;
    }

    this.status.set('started');
  }

  updateAutoScroll() {
    const logOutput = this.logOutput().nativeElement;
    const distanceFromBottom = logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight;

    this.autoScrollEnabled.set(distanceFromBottom <= 2);
  }

  abort() {
    defer(() => this.#dupServer.postApiV1CommandlineByRunidAbort({ path: { runid: this.runId() } })).subscribe({
      next: () => {
        this.status.set('aborted');
        this.#stopPolling();
      },
      error: (error) => this.#handleError(error, 'finished'),
    });
  }

  #handleError(error: unknown, notFoundStatus?: Status) {
    if (getErrorStatus(error) !== 404) return;

    // A missing run is terminal: the server only removes runs that have finished
    if (notFoundStatus) this.status.set(notFoundStatus);
    this.#stopPolling();
  }

  #stopPolling() {
    clearInterval(this.interval);
  }

  ngOnDestroy() {
    this.#stopPolling();
  }
}
