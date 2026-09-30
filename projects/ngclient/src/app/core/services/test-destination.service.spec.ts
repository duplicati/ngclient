import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { firstValueFrom, of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DestinationTestResponseDto, DuplicatiServer } from '../openapi';
import { SysinfoState } from '../states/sysinfo.state';
import { FolderHandlingOption, TestDestinationService } from './test-destination.service';

describe('TestDestinationService', () => {
  const targetUrl = 'webdav://example.com/folder';
  const destinationIndex = 3;

  afterEach(() => TestBed.resetTestingModule());

  const setup = (useV2: boolean) => {
    const server = {
      postApiV1RemoteoperationTest: vi.fn(),
      postApiV1RemoteoperationCreate: vi.fn(),
      postApiV2DestinationTest: vi.fn(),
    };
    const dialog = { open: vi.fn() };

    TestBed.configureTestingModule({
      providers: [
        TestDestinationService,
        { provide: DuplicatiServer, useValue: server },
        { provide: ShipDialogService, useValue: dialog },
        { provide: SysinfoState, useValue: { hasV2TestOperations: () => useV2 } },
      ],
    });

    return { service: TestBed.inject(TestDestinationService), server, dialog };
  };

  const testDestination = (
    service: TestDestinationService,
    overrides: {
      targetUrl?: string;
      backupId?: string | null;
      connectionStringId?: number | null;
      sourcePrefix?: string | null;
      folderHandling?: FolderHandlingOption;
      readOnlyTest?: boolean;
    } = {}
  ) =>
    firstValueFrom(
      service.testDestination(
        overrides.targetUrl ?? targetUrl,
        overrides.backupId === undefined ? 'backup-1' : overrides.backupId,
        overrides.connectionStringId === undefined ? 42 : overrides.connectionStringId,
        overrides.sourcePrefix === undefined ? 'source-prefix' : overrides.sourcePrefix,
        destinationIndex,
        'Backend',
        true,
        overrides.folderHandling ?? 'prompt',
        overrides.readOnlyTest ?? true
      )
    );

  const v2Response = (
    data: Partial<NonNullable<DestinationTestResponseDto['Data']>> = {}
  ): DestinationTestResponseDto => ({
    Success: true,
    Error: null,
    StatusCode: null,
    Data: {
      FolderExists: true,
      FolderIsEmpty: true,
      FolderContainsBackupFiles: false,
      FolderContainsEncryptedBackupFiles: false,
      AfterConnect: true,
      HostCertificate: null,
      ReportedHostKey: null,
      AcceptedHostKey: null,
      ...data,
    },
  });

  it('uses the V1 endpoint and forwards existing backup context', async () => {
    const { service, server } = setup(false);
    server.postApiV1RemoteoperationTest.mockReturnValue(of({}));

    await expect(testDestination(service)).resolves.toEqual({
      action: 'success',
      targetUrl,
      testAgain: false,
      destinationIndex,
    });
    expect(server.postApiV1RemoteoperationTest).toHaveBeenCalledWith({
      query: { readOnlyTest: true, type: 'Backend' },
      body: {
        path: targetUrl,
        backupId: 'backup-1',
        connectionStringId: 42,
        sourcePrefix: 'source-prefix',
      },
    });
    expect(server.postApiV2DestinationTest).not.toHaveBeenCalled();
  });

  it('uses the V2 endpoint and normalizes new backup context', async () => {
    const { service, server } = setup(true);
    server.postApiV2DestinationTest.mockReturnValue(of(v2Response()));

    await testDestination(service, {
      backupId: 'new',
      connectionStringId: null,
      sourcePrefix: 'ignored-prefix',
      folderHandling: 'create',
      readOnlyTest: false,
    });

    expect(server.postApiV2DestinationTest).toHaveBeenCalledWith({
      body: {
        DestinationUrl: targetUrl,
        ConnectionStringId: null,
        BackupId: null,
        AutoCreate: true,
        ReadOnlyTest: false,
        Options: null,
        DestinationType: 'Backend',
        SourcePrefix: null,
      },
    });
    expect(server.postApiV1RemoteoperationTest).not.toHaveBeenCalled();
  });

  it('maps V2 destination contents into the success result', async () => {
    const { service, server } = setup(true);
    server.postApiV2DestinationTest.mockReturnValue(
      of(
        v2Response({
          FolderIsEmpty: false,
          FolderContainsBackupFiles: true,
          FolderContainsEncryptedBackupFiles: true,
        })
      )
    );

    await expect(testDestination(service)).resolves.toEqual({
      action: 'success',
      targetUrl,
      testAgain: false,
      destinationIndex,
      anyFilesFound: true,
      containsBackup: true,
      containsEncryptedBackupFiles: true,
    });
  });

  it.each([
    ['FolderExists', v2Response({ FolderExists: false })],
    ['StatusCode', { ...v2Response(), StatusCode: 'missing-folder' }],
  ])('maps a V2 missing folder reported through %s', async (_, response) => {
    const { service, server, dialog } = setup(true);
    server.postApiV2DestinationTest.mockReturnValue(
      throwError(() => ({ error: { body: response }, message: 'Destination test failed' }))
    );

    await expect(testDestination(service)).resolves.toMatchObject({
      action: 'missing-folder',
      targetUrl,
      testAgain: false,
      destinationIndex,
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('maps a V1 missing folder error without opening a dialog', async () => {
    const { service, server, dialog } = setup(false);
    server.postApiV1RemoteoperationTest.mockReturnValue(throwError(() => ({ message: 'missing-folder' })));

    await expect(testDestination(service)).resolves.toMatchObject({
      action: 'missing-folder',
      targetUrl,
      testAgain: false,
      destinationIndex,
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'V1',
      useV2: false,
      error: { message: 'incorrect-cert:sha256-cert' },
    },
    {
      name: 'V2',
      useV2: true,
      error: {
        error: { requestBody: v2Response({ HostCertificate: 'sha256-cert' }) },
        message: 'Destination test failed',
      },
    },
  ])('suggests trusting a certificate from a $name error', async ({ useV2, error }) => {
    const { service, server, dialog } = setup(useV2);
    const request = throwError(() => error);
    if (useV2) server.postApiV2DestinationTest.mockReturnValue(request);
    else server.postApiV1RemoteoperationTest.mockReturnValue(request);

    await expect(testDestination(service, { targetUrl: `${targetUrl}?auth-username=user` })).resolves.toMatchObject({
      action: 'trust-cert',
      targetUrl: `${targetUrl}?auth-username=user`,
      suggestedUrl: `${targetUrl}?auth-username=user&accept-specified-ssl-hash=sha256-cert`,
      testAgain: true,
      certData: 'sha256-cert',
      destinationIndex,
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'V1',
      useV2: false,
      error: { message: 'incorrect-host-key:"reported-key", accepted-host-key:"",' },
    },
    {
      name: 'V2',
      useV2: true,
      error: {
        error: { body: v2Response({ ReportedHostKey: 'reported-key', AcceptedHostKey: null }) },
        message: 'Destination test failed',
      },
    },
  ])('suggests adding a missing SSH key from a $name error', async ({ useV2, error }) => {
    const { service, server, dialog } = setup(useV2);
    const request = throwError(() => error);
    if (useV2) server.postApiV2DestinationTest.mockReturnValue(request);
    else server.postApiV1RemoteoperationTest.mockReturnValue(request);

    await expect(testDestination(service)).resolves.toMatchObject({
      action: 'approve-host-key',
      targetUrl,
      suggestedUrl: `${targetUrl}?ssh-fingerprint=reported-key`,
      testAgain: true,
      reportedHostKey: 'reported-key',
      destinationIndex,
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('replaces an existing SSH fingerprint while preserving other parameters', async () => {
    const { service, server, dialog } = setup(true);
    server.postApiV2DestinationTest.mockReturnValue(
      throwError(() => ({
        error: {
          body: v2Response({ ReportedHostKey: 'new-key', AcceptedHostKey: 'old-key' }),
        },
        message: 'Destination test failed',
      }))
    );

    const result = await testDestination(service, {
      targetUrl: `${targetUrl}?ssh-fingerprint=old-key&auth-username=user`,
    });
    const suggestedUrl = new URL(result.suggestedUrl!);

    expect(result).toMatchObject({
      action: 'approve-host-key',
      testAgain: true,
      reportedHostKey: 'new-key',
      destinationIndex,
    });
    expect(suggestedUrl.searchParams.get('ssh-fingerprint')).toBe('new-key');
    expect(suggestedUrl.searchParams.get('auth-username')).toBe('user');
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('maps an unsuccessful V2 response to a generic error', async () => {
    const { service, server, dialog } = setup(true);
    server.postApiV2DestinationTest.mockReturnValue(
      of({ Success: false, Error: 'Access denied', StatusCode: 'failed' } satisfies DestinationTestResponseDto)
    );

    await expect(testDestination(service)).resolves.toEqual({
      action: 'generic-error',
      targetUrl,
      testAgain: false,
      destinationIndex,
      errorMessage: 'Access denied',
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it.each([
    ['V1', false],
    ['V2', true],
  ])('maps an unclassified %s error to a generic error', async (_, useV2) => {
    const { service, server, dialog } = setup(useV2);
    const request = throwError(() => ({ message: 'Connection refused' }));
    if (useV2) server.postApiV2DestinationTest.mockReturnValue(request);
    else server.postApiV1RemoteoperationTest.mockReturnValue(request);

    await expect(testDestination(service)).resolves.toEqual({
      action: 'generic-error',
      targetUrl,
      testAgain: false,
      destinationIndex,
      errorMessage: 'Connection refused',
    });
    expect(dialog.open).not.toHaveBeenCalled();
  });
});
