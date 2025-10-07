import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpHeaders,
  HttpInterceptorFn,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { ENVIRONMENT_TOKEN } from '../../../environments/environment-token';
import { RelayWebsocketService, RequestMethod } from '../services/relay-websocket.service';
import { RelayconfigState } from '../states/relayconfig.state';

type CallState = {
  relayconfigState: RelayconfigState;
  defaultTimeout: number;
  relayWebsocket: RelayWebsocketService;
};

function bufferToStringBase64(str: any) {
  // TODO - Handle files... (Probably a buffer already and should just be returned as is)
  if (typeof str !== 'string') {
    return null;
  }

  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  return window.btoa(String.fromCharCode(...uint8Array));
}

function handleRequest(state: CallState, req: HttpRequest<unknown>, next: HttpHandlerFn) {
  const relayconfig = state.relayconfigState.config();

  if (relayconfig === null) return next(req);

  const bodyBase64 = bufferToStringBase64(req.body);
  const headers: { [key: string]: string } = {};
  req.headers.keys().forEach((key) => {
    headers[key] = req.headers.get(key) ?? '';
  });

  const timeoutHeaderValue = req.headers.get('timeout');

  let timeoutValue = timeoutHeaderValue !== null ? parseInt(timeoutHeaderValue) : state.defaultTimeout;

  if (req.url.startsWith('/api/v1/serverstate') && req.url.includes('longpoll=true')) {
    timeoutValue = 1000 * 99; // 99s
  }

  const p = state.relayWebsocket.sendCommand(
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
    })
    .catch((err) => {
      observer.error(new HttpErrorResponse({
        error: err ?? 'Unknown error',
        status: 0,
        statusText: err ?? 'Unknown error',
      }));
    });
  });
}

export const httpInterceptorWebsocketRelay: HttpInterceptorFn = (req, next) => {
  // Prepare the state object as we cannot inject later
  const state: CallState = {
    relayconfigState: inject(RelayconfigState),
    defaultTimeout: inject(ENVIRONMENT_TOKEN).defaultTimeout,
    relayWebsocket: inject(RelayWebsocketService),
  };

  const relayconfig = state.relayconfigState.config();

  // If the config is not loaded, wait for it to load before handling the request
  if (state.relayconfigState.configLoaded !== null && relayconfig === null) {
    const sub = new Subject<HttpEvent<any>>();
    state.relayconfigState.configLoaded.subscribe((res) => {
      if (res) handleRequest(state, req, next).subscribe(sub);
    });

    return sub;
  }

  // Otherwise, handle the request immediately
  return handleRequest(state, req, next);
};
