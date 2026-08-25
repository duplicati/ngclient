import { inject, Injectable, signal } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { DuplicatiServer } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class CrashLogState {
  #dupServer = inject(DuplicatiServer);

  isLoaded = signal(false);
  crashLog = signal<string | null>(null);

  load() {
    if (this.isLoaded()) return;
    defer(() => this.#dupServer.getApiV1LogdataCrashlog())
      .pipe(finalize(() => this.isLoaded.set(true)))
      .subscribe({
        next: (res) => {
          this.crashLog.set(res.Logdata ?? null);
        },
      });
  }
}
