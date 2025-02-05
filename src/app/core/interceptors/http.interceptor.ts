import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SparkleAlertService } from '@sparkle-ui/core';
import { catchError, finalize, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { mapLocale } from '../locales/locales.utility';
import { AccessTokenOutput } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState, dummytoken } from '../states/app-auth.state';

let refreshRequest: Observable<AccessTokenOutput> | null = null;

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AppAuthState);
  const router = inject(Router);
  const ls = inject(LOCALSTORAGE);
  const env = inject(ENVIRONMENT_TOKEN);
  const locale = ls.getItem('locale');
  const sparkleAlertService = inject(SparkleAlertService);
  const mappedLocale = mapLocale(locale);
  const loginRequest = req.url === '/api/v1/auth/login';
  const token = auth.token();

  let modifiedRequest = req;

  const hasCustomProxyHeader = req.headers.has('custom-proxy-check');
  const IS_PROXY_REQUEST = hasCustomProxyHeader || token === dummytoken;

  if (token && req.url.startsWith(env.baseUrl) && !IS_PROXY_REQUEST) {
    let newHeaders = req.headers.set('Authorization', `Bearer ${token}`);

    if (locale && locale !== 'en-US') {
      newHeaders = newHeaders.set('X-Ui-Language', mappedLocale);
    }

    modifiedRequest = req.clone({
      headers: newHeaders,
    });
  }

  return next(modifiedRequest).pipe(
    catchError((error) => {
      sparkleAlertService.error(error.message);

      if (!loginRequest && !IS_PROXY_REQUEST && error.status === 401 && !refreshRequest) {
        refreshRequest = auth.refreshToken().pipe(shareReplay());
      }

      if (!loginRequest && !IS_PROXY_REQUEST && error.status === 401) {
        return refreshRequest!.pipe(
          switchMap(() => {
            return next(
              req.clone({
                headers: req.headers.set('Authorization', `Bearer ${auth.token()}`),
              })
            );
          }),
          catchError((err) => {
            router.navigate(['/logout']);
            return throwError(() => err);
          }),
          finalize(() => (refreshRequest = null))
        );
      }

      const errorMsg = `Error Code: ${error.status}, Message: ${error.message}`;

      return throwError(() => {
        return {
          error,
          message: errorMsg,
        };
      });
    })
  );
};
