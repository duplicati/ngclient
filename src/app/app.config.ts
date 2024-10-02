import { ApplicationConfig, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';
import { ENVIRONMENT_TOKEN } from '../environments/environment-token';
import { routes } from './app.routes';
import { httpInterceptor } from './core/interceptors/http.interceptor';
import { httpInterceptorWebsocketRelay } from './core/interceptors/websocket.interceptor';
import { DayJsProvider } from './core/providers/dayjs';
import { LOCALSTORAGE } from './core/services/localstorage.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([httpInterceptorWebsocketRelay, httpInterceptor])),
    LOCALSTORAGE,

    { provide: ENVIRONMENT_TOKEN, useValue: environment },
    DayJsProvider,
  ],
};
