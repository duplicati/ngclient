import { HttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Observable, Subject, Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, WebModuleOutputDto } from '../openapi';
import { RelayconfigState } from '../states/relayconfig.state';
import { WebModulesService } from './webmodules.service';

describe('WebModulesService storage operations', () => {
  let subscriptions: Subscription[] = [];
  let responses: Subject<WebModuleOutputDto>[] = [];

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    responses.forEach((response) => response.complete());
    subscriptions = [];
    responses = [];
    TestBed.resetTestingModule();
  });

  const setup = () => {
    const response = new Subject<WebModuleOutputDto>();
    responses.push(response);
    const server = {
      postApiV1WebmoduleByModulekey: vi.fn(
        (_request: Parameters<DuplicatiServer['postApiV1WebmoduleByModulekey']>[0]) => response.asObservable()
      ),
    };
    TestBed.configureTestingModule({
      providers: [
        WebModulesService,
        { provide: DuplicatiServer, useValue: server },
        { provide: HttpClient, useValue: { post: vi.fn() } },
        { provide: RelayconfigState, useValue: { relayIsEnabled: () => false } },
      ],
    });
    return { service: TestBed.inject(WebModulesService), server, response };
  };

  const observe = <T>(result: Observable<T>) => {
    const observer = { next: vi.fn(), error: vi.fn(), complete: vi.fn() };
    subscriptions.push(result.subscribe(observer));
    expect(observer.next).not.toHaveBeenCalled();
    expect(observer.error).not.toHaveBeenCalled();
    expect(observer.complete).not.toHaveBeenCalled();
    return observer;
  };

  it.each(['backup-42', null, undefined])('requests a Filen key lazily with backup ID %s', (backupId) => {
    const { service, server, response } = setup();
    const url = 'filen://backup-folder?username=test-user';
    const result = service.getFilenApiKey(url, backupId);
    expect(server.postApiV1WebmoduleByModulekey).not.toHaveBeenCalled();
    const observer = observe(result);
    expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledExactlyOnceWith({
      path: { modulekey: 'filen-get-api-key' },
      body: { 'filen-operation': 'GetApiKey', 'backup-id': backupId ?? '', url },
    });
    response.next({ Result: { 'api-key': 'test-api-key' } });
    expect(observer.next).toHaveBeenCalledExactlyOnceWith('test-api-key');
    expect(observer.complete).not.toHaveBeenCalled();
    response.complete();
    expect(observer.complete).toHaveBeenCalledTimes(1);
    expect(observer.error).not.toHaveBeenCalled();
  });

  it.each(['test-key+/=', ''])('preserves the returned Filen key %j', (key) => {
    const { service, response } = setup();
    const observer = observe(service.getFilenApiKey('filen://backup-folder'));
    response.next({ Result: { unrelated: 'ignore-me', 'api-key': key } });
    response.complete();
    expect(observer.next).toHaveBeenCalledExactlyOnceWith(key);
    expect(observer.complete).toHaveBeenCalledTimes(1);
    expect(observer.error).not.toHaveBeenCalled();
  });

  it.each([{ folders: ['second', 'first', '資料/バックアップ'] }, { folders: [] }])(
    'requests Storage backups lazily and preserves folders $folders',
    ({ folders }) => {
      const { service, server, response } = setup();
      const url = 'duplicati://storage-root';
      const result = service.getDuplicatiStorageBackups(url);
      expect(server.postApiV1WebmoduleByModulekey).not.toHaveBeenCalled();
      const observer = observe(result);
      expect(server.postApiV1WebmoduleByModulekey).toHaveBeenCalledExactlyOnceWith({
        path: { modulekey: 'duplicati-list-backups' },
        body: { action: 'ListBackups', url },
      });
      response.next({ Result: { unrelated: 'ignore-me', folders: JSON.stringify(folders) } });
      expect(observer.next).toHaveBeenCalledExactlyOnceWith(folders);
      expect(observer.complete).not.toHaveBeenCalled();
      response.complete();
      expect(observer.complete).toHaveBeenCalledTimes(1);
      expect(observer.error).not.toHaveBeenCalled();
    }
  );

  it.each(['getFilenApiKey', 'getDuplicatiStorageBackups'] as const)(
    'propagates API errors from %s without a success result',
    (method) => {
      const { service, response } = setup();
      const observer = observe<string | string[]>(service[method]('test://storage'));
      const error = new Error('Webmodule request failed');
      response.error(error);
      expect(observer.error).toHaveBeenCalledExactlyOnceWith(error);
      expect(observer.next).not.toHaveBeenCalled();
      expect(observer.complete).not.toHaveBeenCalled();
    }
  );

  it('propagates invalid Storage folder JSON without a success result', () => {
    const { service, response } = setup();
    const observer = observe(service.getDuplicatiStorageBackups('duplicati://storage-root'));
    response.next({ Result: { folders: '{invalid-json' } });
    response.complete();
    expect(observer.error).toHaveBeenCalledExactlyOnceWith(expect.any(SyntaxError));
    expect(observer.next).not.toHaveBeenCalled();
    expect(observer.complete).not.toHaveBeenCalled();
  });
});
