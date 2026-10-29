import { inject, Injectable } from '@angular/core';
import { PreloadingStrategy, Route } from '@angular/router';
import { catchError, defer, Observable, of } from 'rxjs';
import { AppAuthState } from '../states/app-auth.state';

/** Preload the shell and explicitly selected authenticated entry points. */
@Injectable({ providedIn: 'root' })
export class StartupPreloadingStrategy implements PreloadingStrategy {
  #auth = inject(AppAuthState);

  preload(route: Route, load: () => Observable<unknown>): Observable<unknown> {
    const policy = route.data?.['preload'];
    if (policy !== 'shell' && (policy !== 'authenticated' || !this.#auth.token())) return of(null);
    // A failed background request must not prevent a later navigation retry.
    return defer(load).pipe(catchError(() => of(null)));
  }
}
