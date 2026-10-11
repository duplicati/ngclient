import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { whenTranslationsReady } from './app/core/locales/locales.utility';

whenTranslationsReady().then(() => bootstrapApplication(App, appConfig));
