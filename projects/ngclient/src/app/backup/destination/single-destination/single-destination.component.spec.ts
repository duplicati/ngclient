import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Observable, of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestDestinationResult, TestDestinationService } from '../../../core/services/test-destination.service';
import { WebModulesService } from '../../../core/services/webmodules.service';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { RemoteControlState } from '../../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { BackupState } from '../../backup.state';
import { BrowsePathDialog } from './browse-path-dialog/browse-path-dialog';
import { SingleDestinationComponent } from './single-destination.component';

describe('SingleDestinationComponent editor', () => {
  let dialogClosed: Subject<string | null>;
  let dialogOpen: ReturnType<typeof vi.fn>;
  let testDestination: ReturnType<typeof vi.fn<(...args: unknown[]) => Observable<TestDestinationResult>>>;

  beforeEach(() => {
    dialogClosed = new Subject<string | null>();
    dialogOpen = vi.fn(() => ({ closed: dialogClosed.asObservable() }));
    testDestination = vi.fn((url: unknown) =>
      of({
        action: 'success',
        targetUrl: url as string,
        testAgain: false,
        destinationIndex: 0,
      } as TestDestinationResult)
    );

    TestBed.configureTestingModule({
      imports: [SingleDestinationComponent],
      providers: [
        { provide: ShipDialogService, useValue: { open: dialogOpen } },
        { provide: BackupState, useValue: { backupId: signal('42'), connectionStringId: signal(7) } },
        { provide: SysinfoState, useValue: { hasV2ListBackendOperations: signal(true) } },
        { provide: ServerSettingsService, useValue: { serverSettings: signal({}) } },
        { provide: DestinationConfigState, useValue: { allModules: signal([]) } },
        { provide: RemoteControlState, useValue: { state: signal('disconnected') } },
        { provide: WebModulesService, useValue: {} },
        { provide: TestDestinationService, useValue: { testDestination } },
      ],
    });
    TestBed.overrideComponent(SingleDestinationComponent, { set: { template: '' } });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(targetUrl: string, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(SingleDestinationComponent);
    fixture.componentRef.setInput('targetUrl', targetUrl);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture;
  }

  it('appends the picked folder to the already configured path', () => {
    const fixture = create('smb://192.168.1.62/backuperika/Desktop?auth-username=u&auth-password=p');

    fixture.componentInstance.browse('custom', 'path', null);
    dialogClosed.next("/lodoro's duck/");
    fixture.detectChanges();

    expect(fixture.componentInstance.targetUrl()).toContain("smb://192.168.1.62/backuperika/Desktop/lodoro's%20duck/");
  });

  it('uses the picked folder directly when no path is configured yet', () => {
    const fixture = create('smb://192.168.1.62/backuperika?auth-username=u&auth-password=p');

    fixture.componentInstance.browse('custom', 'path', null);
    dialogClosed.next('/sub/');
    fixture.detectChanges();

    expect(fixture.componentInstance.targetUrl()).toContain('smb://192.168.1.62/backuperika/sub/');
  });

  it('passes explicit identifiers to the browse dialog when not using backup state', () => {
    const fixture = create('smb://192.168.1.62/backuperika/Desktop', {
      backupId: '80',
      sourcePrefix: '@/dupl-smb-jhx9qtls',
      remoteType: 'SourceProvider',
    });

    fixture.componentInstance.browse('custom', 'path', null);

    expect(dialogOpen).toHaveBeenCalledWith(
      BrowsePathDialog,
      expect.objectContaining({
        data: expect.objectContaining({
          backupId: '80',
          connectionStringId: null,
          sourcePrefix: '@/dupl-smb-jhx9qtls',
          destinationType: 'SourceProvider',
        }),
      })
    );
  });

  it('reads identifiers from the backup state when useBackupState is set', () => {
    const fixture = create('smb://192.168.1.62/backuperika/Desktop', { useBackupState: true });

    fixture.componentInstance.browse('custom', 'path', null);

    expect(dialogOpen).toHaveBeenCalledWith(
      BrowsePathDialog,
      expect.objectContaining({
        data: expect.objectContaining({ backupId: '42', connectionStringId: 7, destinationType: 'Backend' }),
      })
    );
  });

  const savedUrl = 'ssh://Example.COM/archive%2fpart?auth-password=p%2525&future=a+b&future=two&flag';

  it('does not rewrite an existing URL when the editor loads', () => {
    const fixture = create(savedUrl);
    expect(fixture.componentInstance.targetUrl()).toBe(savedUrl);
  });

  it('preserves the untouched authority, credentials, query spelling and repeated options when one option changes', () => {
    const fixture = create(savedUrl);
    fixture.componentInstance.updateFieldValue('advanced', 'retry-count', '8');
    fixture.detectChanges();
    expect(fixture.componentInstance.targetUrl()).toBe(savedUrl + '&retry-count=8');
  });

  it('preserves unrelated options when the destination path changes', () => {
    const fixture = create(savedUrl);
    fixture.componentInstance.updateFieldValue('custom', 'path', 'archive/new folder');
    fixture.detectChanges();
    expect(fixture.componentInstance.targetUrl()).toBe(
      'ssh://Example.COM/archive/new%20folder?auth-password=p%2525&future=a+b&future=two&flag'
    );
  });

  it('keeps the original URL when the browse dialog is cancelled', () => {
    const fixture = create(savedUrl);
    fixture.componentInstance.browse('custom', 'path', null);
    dialogClosed.next(null);
    fixture.detectChanges();
    expect(fixture.componentInstance.targetUrl()).toBe(savedUrl);
  });

  describe('SSH host key', () => {
    const sshUrl = 'ssh://sftp.example.test:2222/home?auth-username=tester&auth-password=fake-sftp-pass-1';
    const hostKey = 'ssh-ed25519 256 3a:4f';
    const hostKeyResult = (url: string, suppressed: boolean): TestDestinationResult => ({
      action: 'approve-host-key',
      targetUrl: url,
      suggestedUrl: `${url}&ssh-fingerprint=${hostKey}`,
      testAgain: true,
      reportedHostKey: hostKey,
      destinationIndex: 0,
      errorMessage: suppressed ? 'not asked' : 'approved',
    });

    it('asks to approve an unknown host key before browsing and browses with the approved key', () => {
      testDestination.mockImplementation((url: unknown, ...rest: unknown[]) =>
        of(hostKeyResult(url as string, rest[5] as boolean))
      );
      const fixture = create(sshUrl);

      fixture.componentInstance.browse('custom', 'path', null);

      // The first test is silent; only the one that reported a host key shows the approval dialog
      expect(testDestination.mock.calls.map((x) => x[6])).toEqual([true, false]);
      expect(testDestination.mock.calls[0][7]).toBe('error');
      expect(testDestination.mock.calls[0][8]).toBe(true);
      expect(dialogOpen).toHaveBeenCalledWith(
        BrowsePathDialog,
        expect.objectContaining({
          data: expect.objectContaining({ destinationUrl: `${sshUrl}&ssh-fingerprint=${hostKey}` }),
        })
      );

      dialogClosed.next('/tester/backups/');
      fixture.detectChanges();
      const url = fixture.componentInstance.targetUrl()!;
      expect(url.startsWith('ssh://sftp.example.test:2222/home/tester/backups/?')).toBe(true);
      expect(new URLSearchParams(url.split('?')[1]).get('ssh-fingerprint')).toBe(hostKey);
    });

    it('does not browse when the host key is not approved', () => {
      testDestination
        .mockImplementationOnce((url: unknown) => of(hostKeyResult(url as string, true)))
        .mockImplementationOnce((url: unknown) =>
          of({
            action: 'generic-error',
            targetUrl: url as string,
            testAgain: false,
            destinationIndex: 0,
          } as TestDestinationResult)
        );
      const fixture = create(sshUrl);

      fixture.componentInstance.browse('custom', 'path', null);

      expect(testDestination).toHaveBeenCalledTimes(2);
      expect(dialogOpen).not.toHaveBeenCalled();
      expect(fixture.componentInstance.targetUrl()).toBe(sshUrl);
    });

    it('browses at once when the test reports no host key', () => {
      const fixture = create(sshUrl);

      fixture.componentInstance.browse('custom', 'path', null);

      expect(testDestination).toHaveBeenCalledTimes(1);
      expect(dialogOpen).toHaveBeenCalledWith(
        BrowsePathDialog,
        expect.objectContaining({ data: expect.objectContaining({ destinationUrl: sshUrl }) })
      );
    });

    it.each([
      ['an approved host key', `${sshUrl}&ssh-fingerprint=${encodeURIComponent(hostKey)}`],
      ['any host key accepted', `${sshUrl}&ssh-accept-any-fingerprints=true`],
      ['a destination other than SSH', 'smb://192.168.1.62/backuperika?auth-username=u&auth-password=p'],
    ])('browses without a test for %s', (_, url) => {
      const fixture = create(url);

      fixture.componentInstance.browse('custom', 'path', null);

      expect(testDestination).not.toHaveBeenCalled();
      expect(dialogOpen).toHaveBeenCalledTimes(1);
    });
  });

  it('clears old form values when an externally supplied URL cannot be parsed', () => {
    const fixture = create(savedUrl);
    fixture.componentRef.setInput('targetUrl', 'ssh://');
    fixture.detectChanges();
    expect(fixture.componentInstance.destinationForm()).toEqual({ custom: {}, dynamic: {}, advanced: {} });
    expect(fixture.componentInstance.targetUrl()).toBe('ssh://');
  });

  it('hides the field editor instead of swallowing edits when the URL cannot be parsed', () => {
    const fixture = create(savedUrl);
    expect(fixture.componentInstance.canEditFields()).toBe(true);
    fixture.componentRef.setInput('targetUrl', 'ssh://12345/path');
    fixture.detectChanges();
    expect(fixture.componentInstance.canEditFields()).toBe(false);
    fixture.componentInstance.updateFieldValue('custom', 'path', 'changed');
    fixture.detectChanges();
    expect(fixture.componentInstance.targetUrl()).toBe('ssh://12345/path');
    fixture.componentRef.setInput('targetUrl', savedUrl);
    fixture.detectChanges();
    expect(fixture.componentInstance.canEditFields()).toBe(true);
  });

  it('does not rewrite an external URL or emit a change when module metadata reloads', () => {
    const fixture = create(savedUrl);
    const changed = vi.fn();
    fixture.componentInstance.targetUrl.subscribe(changed);
    (TestBed.inject(DestinationConfigState).allModules as ReturnType<typeof signal<any[]>>).set([]);
    fixture.detectChanges();
    expect(fixture.componentInstance.targetUrl()).toBe(savedUrl);
    expect(changed).not.toHaveBeenCalled();
  });
});
