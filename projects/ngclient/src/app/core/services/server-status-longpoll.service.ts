import { inject, Injectable, signal } from '@angular/core';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { defer, Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { DisconnectedDialogComponent } from '../components/disconnected-dialog/disconnected-dialog.component';
import { DuplicatiServer, ServerStatusDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class ServerStatusLongPollService {
  dialog = inject(ShipDialogService);
  #dupServer = inject(DuplicatiServer);
  #connectionStatus = signal<ConnectionStatus>('disconnected');
  #serverState = signal<ServerStatusDto | null>(null);
  #lastEventId = signal<number>(-1);
  #failedConnectionAttempts = signal(0);
  #awaitingPoll = signal(false);
  #destroy$ = new Subject<void>();
  #retryTimeout: ReturnType<typeof setTimeout> | null = null;

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
    this.#awaitingPoll.set(false);
    this.#destroy$.next();
    this.#destroy$.complete();
    this.#clearRetryTimeout();
    this.#closeDisconnectedDialog();
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

    defer(() =>
      this.#dupServer.getApiV1Serverstate({
        query: {
          lastEventId: this.#lastEventId(),
          longpoll: this.#lastEventId() >= 0,
          duration: this.duration,
        },
      })
    )
      .pipe(takeUntil(this.#destroy$))
      .subscribe({
        next: (response) => {
          if (response) {
            this.#processServerState(response);
          }

          this.#scheduleNextPoll();
        },
        error: (error) => {
          this.#failedConnectionAttempts.set(this.#failedConnectionAttempts() + 1);

          if (this.#failedConnectionAttempts() > 3) {
            this.#connectionStatus.set('disconnected');
          }

          if (!this.#disconnectedDialog) {
            this.#disconnectedDialog = this.dialog.open(DisconnectedDialogComponent, {
              closeOnButton: false,
              closeOnEsc: false,
              closeOnOutsideClick: false,
            });
          }

          this.#disconnectedDialog.component.reconnectTimer.set(5000);
          this.#scheduleRetry();
        },
      });
  }

  #processServerState(response: ServerStatusDto) {
    this.#connectionStatus.set('connected');
    this.#serverState.set(response);
    this.#lastEventId.set(response.LastEventID ?? -1);
    this.#failedConnectionAttempts.set(0);

    this.#closeDisconnectedDialog();
  }

  #scheduleNextPoll() {
    const awaitingPoll = this.#awaitingPoll();

    if (!awaitingPoll) return;

    this.#longPoll();
  }

  #scheduleRetry() {
    this.#clearRetryTimeout();
    this.#retryTimeout = setTimeout(() => {
      this.#retryTimeout = null;
      if (this.#awaitingPoll()) this.#longPoll();
    }, 5000);
  }

  #clearRetryTimeout() {
    if (this.#retryTimeout === null) return;

    clearTimeout(this.#retryTimeout);
    this.#retryTimeout = null;
  }

  #closeDisconnectedDialog() {
    if (!this.#disconnectedDialog) return;

    this.#disconnectedDialog.close();
    this.#disconnectedDialog = undefined;
  }
}
