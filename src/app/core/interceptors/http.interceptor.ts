import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SparkleAlertService } from '@sparkle-ui/core';
import { catchError, finalize, map, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { mapLocale } from '../locales/locales.utility';
import { AccessTokenOutputDto } from '../openapi';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState, dummytoken } from '../states/app-auth.state';

let refreshRequest: Observable<AccessTokenOutputDto> | null = null;

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
  const isConnectionTestRequest = req.url === '/api/v1/remoteoperation/test';
  const isV2Request = req.url.startsWith('/api/v2/');
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
    map((event) => {
      // V2 responses returns http status 200 and the error message in the body
      if (event.type === 4 && event.status === 200 && isV2Request) {
        const body = (event.body as any);
        if (body?.Success === false) {
          throw {
            status: 200,
            message: body?.Error ?? 'Unknown error',
            error: {
              Error: body?.Error ?? 'Unknown error'
            },
            body: body,
          };
        }
      }
      return event;
    }),
    catchError((error) => {
      const errorMsg = error.error?.Error || `Error Code: ${error.status}, Message: ${error.message}`;

      // Suppress error handling for proxy detection requests
      if (!IS_PROXY_DETECT_REQUEST) {
        if (isProgressStateRequest && error.status === 404) {
          // Suppress 404 errors for progressstate requests, API needs to change
        } else if (isConnectionTestRequest) {
          // Suppress errors for connection test requests, API needs to change
        } else {
          sparkleAlertService.error(errorMsg);
        }

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

      return throwError(() => {
        return {
          error,
          message: errorMsg,
        };
      });
    })
  );
};
