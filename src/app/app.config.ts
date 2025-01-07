/// <reference types="@angular/localize" />

import { ApplicationConfig, LOCALE_ID, provideExperimentalZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { DecimalPipe } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { environment } from '../environments/environment';
import { ENVIRONMENT_TOKEN } from '../environments/environment-token';
import { routes } from './app.routes';
import { httpInterceptor } from './core/interceptors/http.interceptor';
import { httpInterceptorWebsocketRelay } from './core/interceptors/websocket.interceptor';
import { getLocale } from './core/locales/locales.utility';
import { BytesPipe } from './core/pipes/byte.pipe';
import { DayJsProvider } from './core/providers/dayjs';
import { LOCALSTORAGE } from './core/services/localstorage.token';

export const appConfig: ApplicationConfig = {
  providers: [
    provideExperimentalZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([httpInterceptorWebsocketRelay, httpInterceptor])),
    LOCALSTORAGE,

    { provide: ENVIRONMENT_TOKEN, useValue: environment },
    { provide: LOCALE_ID, useValue: getLocale() },
    DayJsProvider,
    DecimalPipe,
    BytesPipe,
  ],
};
