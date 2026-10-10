import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebModulesService } from '../../../core/services/webmodules.service';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { RemoteControlState } from '../../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { BackupState } from '../../backup.state';
import { BrowsePathDialog } from './browse-path-dialog/browse-path-dialog';
import { SingleDestinationComponent } from './single-destination.component';

describe('SingleDestinationComponent browse', () => {
  let dialogClosed: Subject<string | null>;
  let dialogOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    dialogClosed = new Subject<string | null>();
    dialogOpen = vi.fn(() => ({ closed: dialogClosed.asObservable() }));

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
      ],
    });
    TestBed.overrideComponent(SingleDestinationComponent, { set: { template: '' } });
  });

  function create(targetUrl: string, inputs: Record<string, unknown> = {}) {
    const fixture = TestBed.createComponent(SingleDestinationComponent);
    fixture.componentRef.setInput('targetUrl', targetUrl);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    // The real template reads destinationType(), which primes the URL mapper
    fixture.componentInstance.destinationType();
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
});
