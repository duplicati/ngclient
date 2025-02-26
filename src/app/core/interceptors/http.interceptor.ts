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
  const isLoginRequest = req.url === '/api/v1/auth/login';
  const isRefreshRequest = req.url === '/api/v1/auth/refresh';
  const isProgressStateRequest = req.url === '/api/v1/progressstate';
  const token = auth.token();

  let modifiedRequest = req;

  const hasCustomProxyHeader = req.headers.has('custom-proxy-check');
  const IS_PROXY_DETECT_REQUEST = hasCustomProxyHeader || token === dummytoken;

  if (token && req.url.startsWith(env.baseUrl) && !IS_PROXY_DETECT_REQUEST) {
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
      // Suppress error handling for proxy detection requests
      if (!IS_PROXY_DETECT_REQUEST) {
        // Suppress 404 errors for progressstate requests, API needs to change
        if (!(isProgressStateRequest && error.status === 404)) sparkleAlertService.error(error.message);

        // Don't error handle refresh requests
        if (isRefreshRequest && error.status === 401) {
          auth.logout();
          router.navigate(['/logout']);
        }

        if (!isLoginRequest && !isRefreshRequest) {
          if (error.status === 401) {
            refreshRequest ??= auth.refreshToken().pipe(shareReplay());

            return refreshRequest!.pipe(
              switchMap(() => {
                return next(
                  req.clone({
                    headers: req.headers.set('Authorization', `Bearer ${auth.token()}`),
                  })
                );
              }),
              finalize(() => (refreshRequest = null))
            );
          }
        }
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
