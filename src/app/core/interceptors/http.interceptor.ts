import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { SparkleAlertService } from '@sparkle-ui/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { AccessTokenOutput } from '../openapi';
import { AppAuthState } from '../states/app-auth.state';

let count = 0;

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AppAuthState);
  const router = inject(Router);
  const env = inject(ENVIRONMENT_TOKEN);
  const sparkleAlertService = inject(SparkleAlertService);

  let modifiedRequest = req;

  // Refresh token if it's older than 15 minutes
  if (auth.tokenSetTime() && Date.now() - auth.tokenSetTime()! > 15 * 60 * 1000 && count < 1) {
    count++;

    return auth.refreshToken().pipe(
      switchMap((newToken: AccessTokenOutput) => {
        modifiedRequest = req.clone({
          headers: req.headers.set('Authorization', `Bearer ${newToken.AccessToken}`),
        });

        return next(modifiedRequest);
      })
    );
  }

  // Add Authorization header if token exists and request URL matches base URL
  if (auth.token() && req.url.startsWith(env.baseUrl)) {
    modifiedRequest = req.clone({
      headers: req.headers.set('Authorization', `Bearer ${auth.token()}`),
    });
  }

  // Handle HTTP errors
  return next(modifiedRequest).pipe(
    catchError((error) => {
      sparkleAlertService.error(error.message);

      // If 401 error, attempt to refresh token and retry request (uncomment if needed)
      if (error.status === 401 && count < 1) {
        count++;

        return auth.refreshToken().pipe(
          switchMap(() => {
            return next(
              req.clone({
                headers: req.headers.set('Authorization', `Bearer ${auth.token()}`),
              })
            );
          })
        );
      } else if (error.status === 401) {
        router.navigate(['/logout']);
        count = 0;
      }

      const errorMsg = `Error Code: ${error.status}, Message: ${error.message}`;
      return throwError(() => errorMsg);
    })
  );
};
