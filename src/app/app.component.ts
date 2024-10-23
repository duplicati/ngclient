import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { LOCALSTORAGE } from './core/services/localstorage.token';
import { RelayconfigState } from './core/states/relayconfig.state';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <router-outlet />
  `,
  styles: [],
})
export class AppComponent {
  #ls = inject(LOCALSTORAGE);
  #route = inject(ActivatedRoute);
  #relayConfigState = inject(RelayconfigState);

  sub: Subscription | null = null;

  ngOnInit() {
    this.#relayConfigState.fetchConfig();
    this.sub = this.#route.queryParams.subscribe(({ accessToken, clientId }: { [key: string]: string }) => {
      if (accessToken?.length && clientId?.length) {
        this.#relayConfigState.setConfig({ accessToken, clientId });
      }
    });
    this.#ls.clearAllNotCurrentVersion();
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
