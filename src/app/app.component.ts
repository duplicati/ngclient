import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterOutlet } from '@angular/router';
import { Subscription } from 'rxjs';
import { DAYJS } from './core/providers/dayjs';
import { LOCALSTORAGE } from './core/services/localstorage.token';
import { RelayconfigState } from './core/states/relayconfig.state';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
  `,
  styles: [],
})
export class AppComponent {
  #dayjs = inject(DAYJS);
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

    // import(`/locale/dayjs/${simpleLocale}`).then((res) => {
    //   console.log(res);

    //   // make sure you load the appropriate dayjs translations...
    // });
  }

  ngOnDestroy() {
    this.sub?.unsubscribe();
  }
}
