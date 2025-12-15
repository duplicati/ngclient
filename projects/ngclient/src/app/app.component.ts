import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LOCALSTORAGE } from './core/services/localstorage.token';
import { RelayconfigState } from './core/states/relayconfig.state';
import { configureOpenApiProxyPath } from './core/utils/proxy-config.util';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `
    <router-outlet />
  `,
  styles: [],
})
export class AppComponent {
  #ls = inject(LOCALSTORAGE);
  #relayConfigState = inject(RelayconfigState);

  ngOnInit() {
    configureOpenApiProxyPath();

    this.#relayConfigState.fetchConfig();
    this.#ls.clearAllNotCurrentVersion();
  }
}
