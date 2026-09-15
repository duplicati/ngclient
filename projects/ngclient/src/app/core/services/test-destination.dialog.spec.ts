import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { finalize, Observable, of, Subject, Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { DestinationTestResponseDto, DuplicatiServer, RemoteDestinationType } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { FolderHandlingOption, TestDestinationResult, TestDestinationService } from './test-destination.service';

type DialogOptions = {
  data: { title: string; message: string };
  closed: (confirmed?: boolean) => void;
};

describe('TestDestinationService dialogs', () => {
  const targetUrl = 'ssh://example.com/backup?auth-username=user';
  const destinationIndex = 2;
  let subscriptions: Subscription[] = [];
  let requests: Subject<unknown>[] = [];

  afterEach(() => {
    subscriptions.forEach((subscription) => subscription.unsubscribe());
    requests.forEach((request) => request.complete());
    subscriptions = [];
    requests = [];
    TestBed.resetTestingModule();
  });

  const setup = (
    v2: boolean,
    folderHandling: FolderHandlingOption = 'prompt',
    url = targetUrl,
    context: {
      destinationType?: RemoteDestinationType;
      backupId?: string | null;
      sourcePrefix?: string | null;
      readOnlyTest?: boolean;
      synchronousSuccess?: boolean;
    } = {}
  ) => {
    const testRequest = new Subject<unknown>();
    const createRequest = new Subject<unknown>();
    requests.push(testRequest, createRequest);
    const testFinalized = vi.fn();
    const createFinalized = vi.fn();
    const testSource: Observable<unknown> = context.synchronousSuccess ? of(v2 ? { Success: true } : {}) : testRequest;
    const testResponse = testSource.pipe(finalize(testFinalized));
    const createResponse = createRequest.pipe(finalize(createFinalized));
    const server = {
      postApiV1RemoteoperationTest: vi.fn(() => testResponse),
      postApiV1RemoteoperationCreate: vi.fn(() => createResponse),
      postApiV2DestinationTest: vi.fn().mockReturnValueOnce(testResponse).mockReturnValue(createResponse),
    };
    const dialogs: DialogOptions[] = [];
    const dialog = {
      open: vi.fn((_component: unknown, options: DialogOptions) => {
        dialogs.push(options);
        return { close: vi.fn() };
      }),
    };
    TestBed.configureTestingModule({
      providers: [
        TestDestinationService,
        { provide: DuplicatiServer, useValue: server },
        { provide: SysinfoState, useValue: { hasV2TestOperations: () => v2 } },
        { provide: ShipDialogService, useValue: dialog },
      ],
    });
    const next = vi.fn<(result: TestDestinationResult) => void>();
    const complete = vi.fn();
    const subscription = TestBed.inject(TestDestinationService)
      .testDestination(
        url,
        context.backupId === undefined ? 'backup-1' : context.backupId,
        42,
        context.sourcePrefix === undefined ? 'source-prefix' : context.sourcePrefix,
        destinationIndex,
        context.destinationType ?? 'Backend',
        false,
        folderHandling,
        context.readOnlyTest ?? true
      )
      .subscribe({ next, complete });
    subscriptions.push(subscription);
    const failMissingFolder = () =>
      testRequest.error(v2 ? { error: { body: { StatusCode: 'missing-folder' } } } : { message: 'missing-folder' });
    const expectNoCreation = () => {
      expect(server.postApiV1RemoteoperationCreate).not.toHaveBeenCalled();
      expect(server.postApiV2DestinationTest).toHaveBeenCalledTimes(v2 ? 1 : 0);
    };
    const expectCompleted = () => {
      expect(next).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledTimes(1);
      expect(next.mock.invocationCallOrder[0]).toBeLessThan(complete.mock.invocationCallOrder[0]);
    };
    const expectPending = () => {
      expect(next).not.toHaveBeenCalled();
      expect(complete).not.toHaveBeenCalled();
    };
    return {
      server,
      dialog,
      dialogs,
      testRequest,
      createRequest,
      next,
      complete,
      subscription,
      testFinalized,
      createFinalized,
      failMissingFolder,
      expectNoCreation,
      expectCompleted,
      expectPending,
    };
  };

  describe.each([false, true])('subscription lifecycle (V2=%s)', (v2) => {
    it.each(['success', 'error'])('releases the initial request and ignores a late %s', (response) => {
      const { subscription, testRequest, testFinalized, dialog, expectPending } = setup(v2);
      subscription.unsubscribe();
      if (response === 'success') testRequest.next(v2 ? { Success: true } : {});
      else testRequest.error({ message: 'Connection refused' });
      expect(testFinalized).toHaveBeenCalledTimes(1);
      expect(dialog.open).not.toHaveBeenCalled();
      expectPending();
    });

    it('does not create a folder after unsubscription while awaiting approval', () => {
      const { subscription, dialogs, failMissingFolder, expectNoCreation, expectPending } = setup(v2);
      failMissingFolder();
      expect(dialogs).toHaveLength(1);
      subscription.unsubscribe();
      dialogs[0].closed(true);
      expectNoCreation();
      expectPending();
    });

    it.each(['success', 'error'])('releases the creation request and ignores a late %s', (response) => {
      const { subscription, dialogs, dialog, failMissingFolder, createRequest, createFinalized, expectPending } =
        setup(v2);
      failMissingFolder();
      dialogs[0].closed(true);
      expect(createFinalized).not.toHaveBeenCalled();
      subscription.unsubscribe();
      if (response === 'success') createRequest.next(v2 ? { Success: true } : {});
      else createRequest.error({ message: 'Creation failed' });
      expect(createFinalized).toHaveBeenCalledTimes(1);
      expect(dialog.open).toHaveBeenCalledTimes(1);
      expectPending();
    });

    it.each(['certificate', 'missing SSH key', 'changed SSH key', 'generic error'])(
      'ignores a late %s dialog answer after unsubscription',
      (kind) => {
        const { subscription, testRequest, dialogs, dialog, expectNoCreation, expectPending } = setup(v2);
        const changed = kind === 'changed SSH key';
        const error =
          kind === 'generic error'
            ? { message: 'Connection refused' }
            : v2
              ? {
                  error: {
                    body: {
                      Data:
                        kind === 'certificate'
                          ? { HostCertificate: 'cert-hash' }
                          : { ReportedHostKey: 'new-key', AcceptedHostKey: changed ? 'old-key' : null },
                    },
                  },
                }
              : {
                  message:
                    kind === 'certificate'
                      ? 'incorrect-cert:cert-hash'
                      : `incorrect-host-key:"new-key", accepted-host-key:"${changed ? 'old-key' : ''}",`,
                };
        testRequest.error(error);
        expect(dialogs).toHaveLength(1);
        subscription.unsubscribe();
        dialogs[0].closed(true);
        expectPending();
        expectNoCreation();
        expect(dialog.open).toHaveBeenCalledTimes(1);
      }
    );

    it('releases the request when a result completes the operation', () => {
      const { testRequest, testFinalized, subscription, expectCompleted } = setup(v2);
      testRequest.next(v2 ? { Success: true } : {});
      expectCompleted();
      expect(subscription.closed).toBe(true);
      expect(testFinalized).toHaveBeenCalledTimes(1);
    });

    it('releases synchronous requests even when completion precedes subscription registration', () => {
      const { testFinalized, subscription, expectCompleted } = setup(v2, 'prompt', targetUrl, {
        synchronousSuccess: true,
      });
      expectCompleted();
      expect(subscription.closed).toBe(true);
      expect(testFinalized).toHaveBeenCalledTimes(1);
    });
  });

  it.each([false, true])('emits a result and completes on ordinary success (V2=%s)', (v2) => {
    const { testRequest, dialog, next, expectPending, expectCompleted } = setup(v2);
    expectPending();
    testRequest.next(v2 ? { Success: true, Data: { FolderIsEmpty: true } } : {});
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ action: 'success', targetUrl, destinationIndex }));
    expectCompleted();
    testRequest.complete();
    expectCompleted();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each([false, true])('waits for folder confirmation and handles refusal (V2=%s)', (v2) => {
    const { dialog, dialogs, next, failMissingFolder, expectNoCreation, expectPending, expectCompleted } = setup(v2);
    failMissingFolder();
    expect(dialog.open).toHaveBeenCalledExactlyOnceWith(ConfirmDialogComponent, expect.any(Object));
    expect(next).not.toHaveBeenCalled();
    expectNoCreation();
    expectPending();
    dialogs[0].closed(false);
    expectNoCreation();
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: 'generic-error', targetUrl, destinationIndex, testAgain: false })
    );
    expectCompleted();
  });

  it('creates a V1 folder only after approval and waits for the success dialog', () => {
    const { server, dialogs, next, createRequest, failMissingFolder, expectPending, expectCompleted } = setup(false);
    failMissingFolder();
    expectPending();
    dialogs[0].closed(true);
    expect(server.postApiV1RemoteoperationCreate).toHaveBeenCalledExactlyOnceWith({
      body: { path: targetUrl, backupId: 'backup-1' },
    });
    expect(next).not.toHaveBeenCalled();
    expectPending();
    createRequest.next({});
    createRequest.complete();
    expect(dialogs).toHaveLength(2);
    expect(next).not.toHaveBeenCalled();
    expectPending();
    dialogs[1].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'test-again',
      targetUrl,
      destinationIndex,
      testAgain: true,
    });
    expectCompleted();
  });

  it.each([
    { destinationType: 'Backend', backupId: 'backup-1', sourcePrefix: 'source-prefix', readOnlyTest: false },
    { destinationType: 'SourceProvider', backupId: 'backup-1', sourcePrefix: 'source-prefix', readOnlyTest: true },
    {
      destinationType: 'RestoreDestinationProvider',
      backupId: 'backup-1',
      sourcePrefix: 'restore-prefix',
      readOnlyTest: false,
    },
    { destinationType: 'SourceProvider', backupId: 'new', sourcePrefix: 'unused-prefix', readOnlyTest: true },
    { destinationType: 'Backend', backupId: null, sourcePrefix: null, readOnlyTest: false },
  ] satisfies {
    destinationType: RemoteDestinationType;
    backupId: string | null;
    sourcePrefix: string | null;
    readOnlyTest: boolean;
  }[])('preserves $destinationType context when retrying for backup $backupId', (context) => {
    const { server, dialogs, failMissingFolder } = setup(true, 'prompt', targetUrl, context);
    const expectedBody = {
      DestinationUrl: targetUrl,
      ConnectionStringId: 42,
      BackupId: context.backupId === 'new' ? null : context.backupId,
      SourcePrefix: context.backupId === 'new' ? null : context.sourcePrefix,
      DestinationType: context.destinationType,
      ReadOnlyTest: context.readOnlyTest,
      Options: null,
      AutoCreate: false,
    };
    expect(server.postApiV2DestinationTest).toHaveBeenCalledExactlyOnceWith({ body: expectedBody });
    const initialBody = server.postApiV2DestinationTest.mock.calls[0][0].body;
    failMissingFolder();
    expect(server.postApiV2DestinationTest).toHaveBeenCalledTimes(1);
    dialogs[0].closed(true);
    expect(server.postApiV2DestinationTest).toHaveBeenCalledTimes(2);
    expect(server.postApiV2DestinationTest).toHaveBeenLastCalledWith({ body: { ...expectedBody, AutoCreate: true } });
    expect(initialBody).toEqual(expectedBody);
    expect(server.postApiV2DestinationTest.mock.calls[1][0].body).not.toBe(initialBody);
  });

  it('retries V2 with AutoCreate after approval and returns folder metadata', () => {
    const { server, dialogs, next, createRequest, failMissingFolder, expectPending, expectCompleted } = setup(true);
    failMissingFolder();
    expectPending();
    dialogs[0].closed(true);
    expect(server.postApiV2DestinationTest).toHaveBeenCalledTimes(2);
    expect(server.postApiV2DestinationTest).toHaveBeenLastCalledWith({
      body: expect.objectContaining({
        DestinationUrl: targetUrl,
        BackupId: 'backup-1',
        ConnectionStringId: 42,
        ReadOnlyTest: true,
        AutoCreate: true,
      }),
    });
    expect(next).not.toHaveBeenCalled();
    expectPending();
    createRequest.next({
      Success: true,
      Error: null,
      StatusCode: null,
      Data: {
        FolderExists: true,
        FolderIsEmpty: false,
        FolderContainsBackupFiles: true,
        FolderContainsEncryptedBackupFiles: true,
        AfterConnect: true,
        HostCertificate: null,
        ReportedHostKey: null,
        AcceptedHostKey: null,
      },
    } satisfies DestinationTestResponseDto);
    createRequest.complete();
    expect(dialogs).toHaveLength(1);
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'success',
      targetUrl,
      destinationIndex,
      testAgain: false,
      anyFilesFound: true,
      containsBackup: true,
      containsEncryptedBackupFiles: true,
    });
    expectCompleted();
  });

  it.each([
    { name: 'V1 HTTP error', v2: false, httpError: true },
    { name: 'V2 HTTP error', v2: true, httpError: true },
    { name: 'V2 unsuccessful response', v2: true, httpError: false },
  ])('waits for the error dialog after $name during creation', ({ v2, httpError }) => {
    const { dialogs, next, createRequest, failMissingFolder, expectPending, expectCompleted } = setup(v2);
    failMissingFolder();
    dialogs[0].closed(true);
    expectPending();
    if (httpError) createRequest.error({ message: 'Access denied' });
    else {
      createRequest.next({ Success: false, Error: 'Access denied', StatusCode: null });
      createRequest.complete();
    }
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].data.message).toContain('Access denied');
    expect(next).not.toHaveBeenCalled();
    expectPending();
    dialogs[1].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'generic-error',
      targetUrl,
      destinationIndex,
      testAgain: false,
    });
    expectCompleted();
  });

  it.each([false, true])('returns missing-folder without prompting when folderHandling is error (V2=%s)', (v2) => {
    const { dialog, next, failMissingFolder, expectNoCreation, expectCompleted } = setup(v2, 'error');
    failMissingFolder();
    expect(dialog.open).not.toHaveBeenCalled();
    expectNoCreation();
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: 'missing-folder', targetUrl, destinationIndex, testAgain: false })
    );
    expectCompleted();
  });

  describe.each([false, true])('trust confirmation (V2=%s)', (v2) => {
    it.each(['certificate', 'missing SSH key', 'changed SSH key'])('approves %s only after confirmation', (kind) => {
      const changed = kind === 'changed SSH key';
      const cert = kind === 'certificate';
      const url = targetUrl + (changed ? '&ssh-fingerprint=old-key' : '');
      const { dialogs, testRequest, next, expectNoCreation, expectPending, expectCompleted } = setup(v2, 'prompt', url);
      const data = cert
        ? { HostCertificate: 'cert-hash' }
        : { ReportedHostKey: 'new-key', AcceptedHostKey: changed ? 'old-key' : null };
      testRequest.error(
        v2
          ? { error: { body: { Data: data } } }
          : {
              message: cert
                ? 'incorrect-cert:cert-hash'
                : `incorrect-host-key:"new-key", accepted-host-key:"${changed ? 'old-key' : ''}",`,
            }
      );
      expect(dialogs).toHaveLength(1);
      expect(next).not.toHaveBeenCalled();
      expectPending();
      dialogs[0].closed(true);
      expect(next).toHaveBeenCalledTimes(1);
      const result = next.mock.calls[0][0];
      expect(result).toMatchObject({
        action: cert ? 'trust-cert' : 'approve-host-key',
        targetUrl: url,
        destinationIndex,
        testAgain: true,
      });
      const suggested = new URL(result.suggestedUrl!);
      expect(suggested.searchParams.get(cert ? 'accept-specified-ssl-hash' : 'ssh-fingerprint')).toBe(
        cert ? 'cert-hash' : 'new-key'
      );
      expect(suggested.searchParams.get('auth-username')).toBe('user');
      expectNoCreation();
      expectCompleted();
    });

    it.each(['certificate', 'missing SSH key', 'changed SSH key'])('rejects %s without suggesting a retry', (kind) => {
      const changed = kind === 'changed SSH key';
      const cert = kind === 'certificate';
      const { dialogs, testRequest, next, expectNoCreation, expectPending, expectCompleted } = setup(v2);
      const data = cert
        ? { HostCertificate: 'cert-hash' }
        : { ReportedHostKey: 'new-key', AcceptedHostKey: changed ? 'old-key' : null };
      testRequest.error(
        v2
          ? { error: { body: { Data: data } } }
          : {
              message: cert
                ? 'incorrect-cert:cert-hash'
                : `incorrect-host-key:"new-key", accepted-host-key:"${changed ? 'old-key' : ''}",`,
            }
      );
      expect(next).not.toHaveBeenCalled();
      expectPending();
      dialogs[0].closed(false);
      expect(next).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ action: 'generic-error', targetUrl, destinationIndex, testAgain: false })
      );
      expect(next.mock.calls[0][0].suggestedUrl).toBeUndefined();
      expectNoCreation();
      expectCompleted();
    });
  });

  it.each([false, true])('waits for the generic error dialog to close (V2=%s)', (v2) => {
    const { testRequest, dialogs, next, expectNoCreation, expectPending, expectCompleted } = setup(v2);
    testRequest.error({ message: 'Connection refused' });
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].data.message).toBe('Connection refused');
    expect(next).not.toHaveBeenCalled();
    expectPending();
    dialogs[0].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'generic-error',
      targetUrl,
      destinationIndex,
      testAgain: false,
      errorMessage: 'Connection refused',
    });
    expectNoCreation();
    expectCompleted();
  });
});
