import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core';
import { catchError, finalize, map, Observable, shareReplay, switchMap, throwError } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { mapLocale } from '../locales/locales.utility';
import { AccessTokenOutputDto } from '../openapi';
import { OpenAPI } from '../openapi/core/OpenAPI';
import { LOCALSTORAGE } from '../services/localstorage.token';
import { AppAuthState, dummytoken } from '../states/app-auth.state';

let refreshRequest: Observable<AccessTokenOutputDto> | null = null;

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AppAuthState);
  const router = inject(Router);
  const ls = inject(LOCALSTORAGE);
  const env = inject(ENVIRONMENT_TOKEN);
  const locale = ls.getItem('locale');
  const shipAlertService = inject(ShipAlertService);
  const mappedLocale = mapLocale(locale);
  const prefix = OpenAPI.BASE || '';
  const isLoginRequest = req.url === `${prefix}/api/v1/auth/login`;
  const isLogoutRequest = req.url === `${prefix}/api/v1/auth/logout`;
  const isRefreshRequest = req.url === `${prefix}/api/v1/auth/refresh`;
  const isProgressStateRequest = req.url === `${prefix}/api/v1/progressstate`;
  const isConnectionTestRequest = req.url === `${prefix}/api/v1/remoteoperation/test`;
  const isValidateFsTestRequest = req.url === `${prefix}/api/v1/filesystem/validate`;
  const isV2Request = req.url.startsWith(`${prefix}/api/v2/`);
  const token = auth.token();

  let modifiedRequest = req;

  const hasCustomProxyHeader = req.headers.has('custom-proxy-check');
  const IS_PROXY_DETECT_REQUEST = hasCustomProxyHeader || token === dummytoken;

  if (token && req.url.startsWith(prefix + env.baseUrl) && !IS_PROXY_DETECT_REQUEST) {
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
        const body = event.body as any;
        if (body?.Success === false) {
          throw {
            status: 200,
            message: body?.Error ?? 'Unknown error',
            error: {
              Error: body?.Error ?? 'Unknown error',
            },
            requestBody: body,
          };
        }
      }
      return event;
    }),
    catchError((error) => {
      const errorMsg = error.error?.Error || `Error Code: ${error.status}, Message: ${error.message}`;

      // Suppress error handling for proxy detection requests
      if (!IS_PROXY_DETECT_REQUEST) {
        // Default to notifying the user
        let notifyUser = true;

        if (isProgressStateRequest && error.status === 404) {
          // Suppress 404 errors for progressstate requests, API needs to change
          notifyUser = false;
        } else if (isConnectionTestRequest || isValidateFsTestRequest) {
          // Suppress errors for test requests, API needs to change
          notifyUser = false;
        }

        // Don't error handle refresh requests
        if (isRefreshRequest && error.status === 401) {
          notifyUser = false;
          auth.logout();
          router.navigate(['/logout']);
        }

        if (!isLoginRequest && !isRefreshRequest && !isLogoutRequest) {
          if (error.status === 401) {
            notifyUser = false;
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

        if (notifyUser) {
          shipAlertService.error(errorMsg);
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
