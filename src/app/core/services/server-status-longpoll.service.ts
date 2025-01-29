import { inject, Injectable, signal } from '@angular/core';
import { of, Subject } from 'rxjs';
import { catchError, finalize, takeUntil } from 'rxjs/operators';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { DuplicatiServerService, ServerStatusDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';

type ConnectionStatus = 'connected' | 'disconnected' | 'connecting';

@Injectable({
  providedIn: 'root',
})
export class ServerStatusLongPollService {
  #dupServer = inject(DuplicatiServerService);
  #connectionStatus = signal<ConnectionStatus>('disconnected');
  #serverState = signal<ServerStatusDto | null>(null);
  #lastEventId = signal<number>(-1);
  #failedConnectionAttempts = signal(0);
  #awaitingPoll = signal(false);
  #destroy$ = new Subject<void>();

  connectionStatus = this.#connectionStatus.asReadonly();
  serverState = this.#serverState.asReadonly();
  // Due to a bug in the Duplicati client, the max duration is 100s when relay is enabled  
  duration = inject(RelayconfigState).relayIsEnabled() 
    // We need to fix the server-status-longpoll service to inject the timeout into the request
    // in a way that can be extracted by the rellay-websocket service, then we can bump it to 100s
    ? (((inject(ENVIRONMENT_TOKEN).defaultTimeout / 1000) - 5) + 's')
    : '299s';

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
    console.log('reconnectIfNeeded');

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
      .pipe(
        takeUntil(this.#destroy$),
        catchError((error) => {
          this.#handleConnectionError(error);
          return of(null);
        }),
        finalize(() => {
          this.#scheduleNextPoll();
        })
      )
      .subscribe((response) => {
        if (response) {
          this.#processServerState(response);
        }
      });
  }

  #processServerState(response: ServerStatusDto) {
    this.#connectionStatus.set('connected');
    this.#serverState.set(response);
    this.#lastEventId.set(response.LastEventID || -1);
    this.#failedConnectionAttempts.set(0);
  }

  #handleConnectionError(error: any) {
    const currentAttempts = this.#failedConnectionAttempts() + 1;
    this.#failedConnectionAttempts.set(currentAttempts);

    if (currentAttempts > 3) {
      this.#connectionStatus.set('disconnected');
    }
  }

  #scheduleNextPoll() {
    const awaitingPoll = this.#awaitingPoll();

    if (!awaitingPoll) return;

    this.#longPoll();
  }
}
