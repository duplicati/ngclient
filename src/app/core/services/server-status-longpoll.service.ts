import { inject, Injectable, signal } from '@angular/core';
import { SparkleDialogService } from '@sparkle-ui/core';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DisconnectedDialogComponent } from '../components/disconnected-dialog/disconnected-dialog.component';
import { DuplicatiServerService, ServerStatusDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class ServerStatusLongPollService {
  dialog = inject(SparkleDialogService);
  #dupServer = inject(DuplicatiServerService);
  #connectionStatus = signal<ConnectionStatus>('disconnected');
  #serverState = signal<ServerStatusDto | null>(null);
  #lastEventId = signal<number>(-1);
  #failedConnectionAttempts = signal(0);
  #awaitingPoll = signal(false);
  #destroy$ = new Subject<void>();

  connectionStatus = this.#connectionStatus.asReadonly();
  serverState = this.#serverState.asReadonly();
  #disconnectedDialog: ReturnType<typeof this.dialog.open<DisconnectedDialogComponent>> | undefined = undefined;

  // Due to a bug in the Duplicati client, the max duration is 100s when relay is enabled
  duration = inject(RelayconfigState).relayIsEnabled() ? '94s' : '299s';

  start() {
    this.#awaitingPoll.set(true);
    this.#destroy$ = new Subject<void>();
    this.#longPoll();
  }

  stop() {
    this.#destroy$.next();
    this.#destroy$.complete();
    this.#awaitingPoll.set(false);
  }

  reconnect() {
    this.stop();
    this.start();
  }

  reconnectIfNeeded() {
    if (this.#awaitingPoll()) {
      return;
    }

    this.reconnect();
  }

  #longPoll() {
    this.#connectionStatus.set('connecting');

    this.#dupServer
      .getApiV1Serverstate({
        lastEventId: this.#lastEventId(),
        longpoll: this.#lastEventId() > 0,
        duration: this.duration,
      })
      .pipe(takeUntil(this.#destroy$))
      .subscribe({
        next: (response) => {
          if (response) {
            this.#processServerState(response);
          }

          this.#scheduleNextPoll();
        },
        error: (error) => {
          const startWaitTime = 5000;
          const nextAttemptCount = this.#failedConnectionAttempts() + 1;
          const waitTime = Math.min(startWaitTime * nextAttemptCount, 30000);

          this.#failedConnectionAttempts.set(nextAttemptCount);

          if (nextAttemptCount > 3) {
            this.#connectionStatus.set('disconnected');
          }

          if (!this.#disconnectedDialog) {
            this.#disconnectedDialog = this.dialog.open(DisconnectedDialogComponent, {
              closeOnButton: false,
              closeOnEsc: false,
              closeOnOutsideClick: false,
            });
          }

          this.#disconnectedDialog.component.reconnectTimer.set(waitTime);
          setTimeout(() => {
            this.#longPoll();
          }, waitTime);
        },
      });
  }

  #processServerState(response: ServerStatusDto) {
    this.#connectionStatus.set('connected');
    this.#serverState.set(response);
    this.#lastEventId.set(response.LastEventID || -1);
    this.#failedConnectionAttempts.set(0);
  }

  #scheduleNextPoll() {
    const awaitingPoll = this.#awaitingPoll();

    if (!awaitingPoll) return;

    this.#longPoll();
  }
}
