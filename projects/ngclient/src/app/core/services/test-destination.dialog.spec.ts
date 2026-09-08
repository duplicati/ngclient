import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject, Subscription } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogComponent } from '../components/confirm-dialog/confirm-dialog.component';
import { DestinationTestResponseDto, DuplicatiServer } from '../openapi';
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

  const setup = (v2: boolean, folderHandling: FolderHandlingOption = 'prompt', url = targetUrl) => {
    const testRequest = new Subject<unknown>();
    const createRequest = new Subject<unknown>();
    requests.push(testRequest, createRequest);
    const server = {
      postApiV1RemoteoperationTest: vi.fn(() => testRequest),
      postApiV1RemoteoperationCreate: vi.fn(() => createRequest),
      postApiV2DestinationTest: vi.fn().mockReturnValueOnce(testRequest).mockReturnValue(createRequest),
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
    subscriptions.push(
      TestBed.inject(TestDestinationService)
        .testDestination(url, 'backup-1', 42, 'source-prefix', destinationIndex, 'Backend', false, folderHandling, true)
        .subscribe(next)
    );
    const failMissingFolder = () =>
      testRequest.error(v2 ? { error: { body: { StatusCode: 'missing-folder' } } } : { message: 'missing-folder' });
    const expectNoCreation = () => {
      expect(server.postApiV1RemoteoperationCreate).not.toHaveBeenCalled();
      expect(server.postApiV2DestinationTest).toHaveBeenCalledTimes(v2 ? 1 : 0);
    };
    return { server, dialog, dialogs, testRequest, createRequest, next, failMissingFolder, expectNoCreation };
  };

  it.each([false, true])('waits for folder confirmation and handles refusal (V2=%s)', (v2) => {
    const { dialog, dialogs, next, failMissingFolder, expectNoCreation } = setup(v2);
    failMissingFolder();
    expect(dialog.open).toHaveBeenCalledExactlyOnceWith(ConfirmDialogComponent, expect.any(Object));
    expect(next).not.toHaveBeenCalled();
    expectNoCreation();
    dialogs[0].closed(false);
    expectNoCreation();
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: 'generic-error', targetUrl, destinationIndex, testAgain: false })
    );
  });

  it('creates a V1 folder only after approval and waits for the success dialog', () => {
    const { server, dialogs, next, createRequest, failMissingFolder } = setup(false);
    failMissingFolder();
    dialogs[0].closed(true);
    expect(server.postApiV1RemoteoperationCreate).toHaveBeenCalledExactlyOnceWith({
      body: { path: targetUrl, backupId: 'backup-1' },
    });
    expect(next).not.toHaveBeenCalled();
    createRequest.next({});
    createRequest.complete();
    expect(dialogs).toHaveLength(2);
    expect(next).not.toHaveBeenCalled();
    dialogs[1].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'test-again',
      targetUrl,
      destinationIndex,
      testAgain: true,
    });
  });

  it('retries V2 with AutoCreate after approval and returns folder metadata', () => {
    const { server, dialogs, next, createRequest, failMissingFolder } = setup(true);
    failMissingFolder();
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
  });

  it.each([
    { name: 'V1 HTTP error', v2: false, httpError: true },
    { name: 'V2 HTTP error', v2: true, httpError: true },
    { name: 'V2 unsuccessful response', v2: true, httpError: false },
  ])('waits for the error dialog after $name during creation', ({ v2, httpError }) => {
    const { dialogs, next, createRequest, failMissingFolder } = setup(v2);
    failMissingFolder();
    dialogs[0].closed(true);
    if (httpError) createRequest.error({ message: 'Access denied' });
    else {
      createRequest.next({ Success: false, Error: 'Access denied', StatusCode: null });
      createRequest.complete();
    }
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].data.message).toContain('Access denied');
    expect(next).not.toHaveBeenCalled();
    dialogs[1].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'generic-error',
      targetUrl,
      destinationIndex,
      testAgain: false,
    });
  });

  it.each([false, true])('returns missing-folder without prompting when folderHandling is error (V2=%s)', (v2) => {
    const { dialog, next, failMissingFolder, expectNoCreation } = setup(v2, 'error');
    failMissingFolder();
    expect(dialog.open).not.toHaveBeenCalled();
    expectNoCreation();
    expect(next).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ action: 'missing-folder', targetUrl, destinationIndex, testAgain: false })
    );
  });

  describe.each([false, true])('trust confirmation (V2=%s)', (v2) => {
    it.each(['certificate', 'missing SSH key', 'changed SSH key'])('approves %s only after confirmation', (kind) => {
      const changed = kind === 'changed SSH key';
      const cert = kind === 'certificate';
      const url = targetUrl + (changed ? '&ssh-fingerprint=old-key' : '');
      const { dialogs, testRequest, next, expectNoCreation } = setup(v2, 'prompt', url);
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
    });

    it.each(['certificate', 'missing SSH key', 'changed SSH key'])('rejects %s without suggesting a retry', (kind) => {
      const changed = kind === 'changed SSH key';
      const cert = kind === 'certificate';
      const { dialogs, testRequest, next, expectNoCreation } = setup(v2);
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
      dialogs[0].closed(false);
      expect(next).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ action: 'generic-error', targetUrl, destinationIndex, testAgain: false })
      );
      expect(next.mock.calls[0][0].suggestedUrl).toBeUndefined();
      expectNoCreation();
    });
  });

  it.each([false, true])('waits for the generic error dialog to close (V2=%s)', (v2) => {
    const { testRequest, dialogs, next, expectNoCreation } = setup(v2);
    testRequest.error({ message: 'Connection refused' });
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].data.message).toBe('Connection refused');
    expect(next).not.toHaveBeenCalled();
    dialogs[0].closed();
    expect(next).toHaveBeenCalledExactlyOnceWith({
      action: 'generic-error',
      targetUrl,
      destinationIndex,
      testAgain: false,
      errorMessage: 'Connection refused',
    });
    expectNoCreation();
  });
});
