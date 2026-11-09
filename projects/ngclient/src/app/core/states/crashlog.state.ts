import { inject, Injectable, signal } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { DuplicatiServer } from '../openapi';

@Injectable({ providedIn: 'root' })
export class CrashLogState {
  #dupServer = inject(DuplicatiServer);

  isLoaded = signal(false);
  isLoading = signal(false);
  loadFailed = signal(false);
  crashLog = signal<string | null>(null);

  load() {
    if (this.isLoaded() || this.isLoading()) return;
    this.isLoading.set(true);
    this.loadFailed.set(false);
    defer(() => this.#dupServer.getApiV1LogdataCrashlog())
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.crashLog.set(res.Logdata ?? null);
          this.isLoaded.set(true);
        },
        // The HTTP interceptor reports the error; do not cache a failed load.
        error: () => this.loadFailed.set(true),
      });
  }
}
