import { inject, Injectable, signal } from '@angular/core';
import { finalize, Observable, tap } from 'rxjs';
import { GetApiV1WebmodulesResponse, WebModulesService } from '../openapi';

@Injectable({
  providedIn: 'root',
})
export class WebModulesState {
  #webModulesService = inject(WebModulesService);

  isLoaded = signal(false);
  webmodules = signal<GetApiV1WebmodulesResponse | null>(null);

  preload(returnObservable = false): Observable<GetApiV1WebmodulesResponse> | void {
    const obs = this.#webModulesService.getApiV1Webmodules().pipe(
      tap((x) => this.webmodules.set(x)),
      finalize(() => this.isLoaded.set(true))
    );

    if (returnObservable) {
      return obs;
    }

    obs.subscribe();
  }
}
