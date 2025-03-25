import { inject, Injectable, signal } from "@angular/core";
import { finalize } from "rxjs";
import { DuplicatiServerService } from "../openapi";

@Injectable({
  providedIn: 'root',
})
export class CrashLogState {
      #dupServer = inject(DuplicatiServerService);
    
      isLoaded = signal(false);
      crashLog = signal<string | null>(null);

      load() {
        if (this.isLoaded()) return;
        this.#dupServer
        .getApiV1LogdataCrashlog()
        .pipe(finalize(() => this.isLoaded.set(true)))
        .subscribe({
            next: (res) => {
            this.crashLog.set(res.Logdata ?? null);
            }
        });
    }
}