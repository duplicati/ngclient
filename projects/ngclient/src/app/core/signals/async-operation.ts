import { computed, signal } from '@angular/core';
import { defer, Observable, Subscription, take } from 'rxjs';

export type AsyncOperationState =
  | { status: 'idle' | 'pending' | 'success' | 'cancelled' }
  | { status: 'error'; error: unknown };

/** A single in-flight operation. Cancellation stops observing; it cannot undo server work. */
export class AsyncOperation<T> {
  #state = signal<AsyncOperationState>({ status: 'idle' });
  #subscription: Subscription | null = null;
  #destroyed = false;
  state = this.#state.asReadonly();
  pending = computed(() => this.state().status === 'pending');

  run(operation: () => Observable<T>, onSuccess: (value: T) => void = () => {}) {
    if (this.#destroyed || this.pending()) return false;
    const subscription = new Subscription();
    this.#subscription = subscription;
    this.#state.set({ status: 'pending' });
    subscription.add(
      defer(operation)
        .pipe(take(1))
        .subscribe({
          next: (value) => {
            if (this.#subscription !== subscription) return;
            this.#subscription = null;
            this.#state.set({ status: 'success' });
            onSuccess(value);
          },
          error: (error) => {
            if (this.#subscription !== subscription) return;
            this.#subscription = null;
            this.#state.set({ status: 'error', error });
          },
          complete: () => {
            if (this.#subscription !== subscription) return;
            this.#subscription = null;
            this.#state.set({ status: 'cancelled' });
          },
        })
    );
    return true;
  }

  cancel() {
    const subscription = this.#subscription;
    if (!subscription) return;
    this.#subscription = null;
    this.#state.set({ status: 'cancelled' });
    subscription.unsubscribe();
  }

  destroy() {
    this.#destroyed = true;
    this.cancel();
  }
}
