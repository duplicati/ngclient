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
    console.log('Unexpected body type: ', typeof str);
    return null;
  }

  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(str);
  return window.btoa(String.fromCharCode(...uint8Array));
}

function base64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return bytes;
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

  const wantsBinaryBody = req.responseType === 'blob' || req.responseType === 'arraybuffer';

  const p = state.relayWebsocket.sendCommand(
    relayconfig.accessToken,
    relayconfig.clientId,
    relayconfig.machineServerUrl,
    req.method as RequestMethod,
    req.url,
    bodyBase64,
    headers,
    timeoutValue,
    wantsBinaryBody
  );

  return new Observable<HttpEvent<any>>((observer) => {
    p.then((response) => {
      const httpHeaders = new HttpHeaders();
      if (headers != null) {
        Object.keys(headers).forEach((key) => {
          httpHeaders.set(key, headers[key]);
        });
      }

      // Binary bodies are transported as base64 and must be materialized
      // into the type the request asked for, otherwise HttpClient throws
      let body: any = response.body;
      if (body != null && req.responseType === 'blob') {
        body = new Blob([base64ToUint8Array(body)]);
      } else if (body != null && req.responseType === 'arraybuffer') {
        body = base64ToUint8Array(body).buffer;
      }

      const httpResponse = new HttpResponse({
        body: body,
        status: response.statusCode,
        statusText: 'OK',
        headers: httpHeaders,
      });

      observer.next(httpResponse);
      observer.complete();
    }).catch((err) => {
      observer.error(
        new HttpErrorResponse({
          error: err ?? 'Unknown error',
          status: 0,
          statusText: err ?? 'Unknown error',
        })
      );
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
