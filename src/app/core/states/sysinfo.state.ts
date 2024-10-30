import { computed, inject, Injectable, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DuplicatiServerService, SystemInfoDto } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class SysinfoState {
  #dupServer = inject(DuplicatiServerService);

  isLoaded = signal(false);
  systemInfo = signal<SystemInfoDto | null>(null);
  backendModules = computed(() => {
    return this.systemInfo()?.BackendModules ?? [];
  });

  sysInfoSignal = toSignal(this.sysInfoObservable());

  preloadSystemInfo(force = false) {
    if (!force && this.systemInfo()) {
      return;
    }

    this.sysInfoObservable()
      .pipe(finalize(() => this.isLoaded.set(true)))
      .subscribe({
        next: (res) => {
          this.systemInfo.set(res);
        },
      });
  }

  sysInfoObservable() {
    return this.#dupServer.getApiV1Systeminfo();
  }
}
