/// <reference types="@angular/localize" />

import { ApplicationConfig, LOCALE_ID, provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { DatePipe, DecimalPipe } from '@angular/common';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { SHIP_CONFIG } from '@ship-ui/core';
import { environment } from '../environments/environment';
import { ENVIRONMENT_TOKEN } from '../environments/environment-token';
import { routes } from './app.routes';
import { StatusBarState } from './core/components/status-bar/status-bar.state';
import { httpInterceptor } from './core/interceptors/http.interceptor';
import { httpInterceptorWebsocketRelay } from './core/interceptors/websocket.interceptor';
import { getLocale } from './core/locales/locales.utility';
import { BytesPipe } from './core/pipes/byte.pipe';
import { DurationFormatPipe } from './core/pipes/duration.pipe';
import { RelativeTimePipe } from './core/pipes/relative-time.pipe';
import { DayJsProvider } from './core/providers/dayjs';
import { LOCALSTORAGE } from './core/services/localstorage.token';
import { NotificationsState } from './notifications/notifications.state';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([httpInterceptorWebsocketRelay, httpInterceptor])),
    LOCALSTORAGE,

    { provide: ENVIRONMENT_TOKEN, useValue: environment },
    { provide: LOCALE_ID, useValue: getLocale() },
    {
      provide: SHIP_CONFIG,
      useValue: {
        alertVariant: 'simple',
      },
    },
    NotificationsState,
    StatusBarState,
    DayJsProvider,
    DecimalPipe,
    BytesPipe,
    DatePipe,
    RelativeTimePipe,
    DurationFormatPipe,
  ],
};
