import { HttpEvent, HttpHandlerFn, HttpHeaders, HttpInterceptorFn, HttpRequest, HttpResponse } from '@angular/common/http';
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

function handleRequest(req: HttpRequest<unknown>, next: HttpHandlerFn)
{
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
}

export const httpInterceptorWebsocketRelay: HttpInterceptorFn = (req, next) => {
  const relayconfigState = inject(RelayconfigState);
  const relayconfig = relayconfigState.config();

  if (relayconfigState.configLoaded !== null && relayconfig === null)
    console.log('Waiting for config to load...');
  else if (relayconfig === null) console.log('Config not loaded, passing request');
  else console.log('Config loaded, handling request');

  // If the config is not loaded, wait for it to load before handling the request
  if (relayconfigState.configLoaded !== null && relayconfig === null)
    return relayconfigState.configLoaded.pipe((_) => handleRequest(req, next));

  // Otherwise, handle the request immediately
  return handleRequest(req, next);
};
