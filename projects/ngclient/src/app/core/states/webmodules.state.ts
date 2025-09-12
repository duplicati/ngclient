import { inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, tap } from 'rxjs';
import { GetApiV1WebmodulesResponse, WebModules } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class WebModulesState {
  #webModules = inject(WebModules);

  isLoaded = signal(false);
  webmodules = signal<GetApiV1WebmodulesResponse | null>(null);

  preload(returnObservable = false): Observable<GetApiV1WebmodulesResponse> | void {
    const obs = this.#webModules.getApiV1Webmodules().pipe(
      tap((x) => this.webmodules.set(x)),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }
}
