import { HttpEvent, HttpHeaders, HttpInterceptorFn, HttpResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { RelayWebsocketService, RequestMethod } from '../services/relay-websocket.service';
import { RelayconfigState } from '../states/relayconfig.state';

function bufferToStringBase64(str: any) {
  // TODO - Handle files... (Probably a buffer already and should just be returned as is)
  if (typeof str !== 'string') {
    return null;
  }

  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  return window.btoa(String.fromCharCode(...uint8Array));
}

export const httpInterceptorWebsocketRelay: HttpInterceptorFn = (req, next) => {
  const relayconfigState = inject(RelayconfigState);
  const relayconfig = relayconfigState.config();
  const environment = inject(ENVIRONMENT_TOKEN);

  if (relayconfig === null) return next(req);

  const relayWebsocket = inject(RelayWebsocketService);
  const bodyBase64 = bufferToStringBase64(req.body);
  const headers: { [key: string]: string } = {};
  req.headers.keys().forEach((key) => {
    headers[key] = req.headers.get(key) ?? '';
  });

  const timeoutHeaderValue = req.headers.get('timeout');
  const timeoutValue = timeoutHeaderValue !== null ? parseInt(timeoutHeaderValue) : environment.defaultTimeout;

  const p = relayWebsocket.sendCommand(
    relayconfig.accessToken,
    relayconfig.clientId,
    req.method as RequestMethod,
    req.url,
    bodyBase64,
    headers,
    timeoutValue
  );

  return new Observable<HttpEvent<any>>((observer) => {
    p.then((response) => {
      const httpHeaders = new HttpHeaders();
      if (headers != null) {
        Object.keys(headers).forEach((key) => {
          httpHeaders.set(key, headers[key]);
        });
      }

      const httpResponse = new HttpResponse({
        body: response.body,
        status: response.code,
        statusText: 'OK',
        headers: httpHeaders,
      });

      observer.next(httpResponse);
      observer.complete();
    });
  });
};
