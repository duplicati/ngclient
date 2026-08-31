import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BackupDto, DuplicatiServer } from '../core/openapi';
import { TimespanLiteralsService } from '../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../core/states/connection-strings.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { BackupState } from './backup.state';

describe('BackupState destination identity', () => {
  let state: BackupState;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: () => Promise.resolve(true) } },
        { provide: SysinfoState, useValue: { systemInfo: signal(null) } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
      ],
    });

    state = TestBed.inject(BackupState);
  });

  afterEach(() => TestBed.resetTestingModule());

  it('assigns a distinct UI key to each loaded destination', () => {
    state.mapDestinationToForm({
      TargetURL: 'file://C:/backup',
      ConnectionStringID: -1,
      AdditionalTargetURLs: [
        {
          TargetUrl: 'webdav://example.com/backup',
          ConnectionStringID: -1,
          UrlKey: 'secondary',
          Mode: null,
          Options: null,
        },
      ],
    } as BackupDto);

    const [local, webdav] = state.targetUrls();

    expect(local.uiKey).toBeTruthy();
    expect(webdav.uiKey).toBeTruthy();
    expect(local.uiKey).not.toBe(webdav.uiKey);
  });

  it('preserves the UI key when a destination is updated', () => {
    state.addTargetUrl('webdav://example.com/backup', null, 'secondary');
    const originalKey = state.targetUrls()[0].uiKey;

    state.updateTargetUrl(0, 'webdav://example.com/updated', 42, 'secondary');
    state.toggleSaveConnectionString(0);

    expect(state.targetUrls()[0]).toMatchObject({
      uiKey: originalKey,
      url: 'webdav://example.com/updated',
      connectionStringId: 42,
      urlKey: 'secondary',
    });
  });

  it('preserves file attribute exclusions when options are loaded and saved', () => {
    state.mapOptionsToForms({
      Settings: [{ Name: '--exclude-files-attributes', Value: 'hidden' }],
    } as BackupDto);

    expect(state.mapFormsToSettings()).toContainEqual({
      Name: '--exclude-files-attributes',
      Value: 'hidden',
    });
  });

  it('continues to round-trip the managed keep-versions option', () => {
    state.mapOptionsToForms({
      Settings: [{ Name: 'keep-versions', Value: '5' }],
    } as BackupDto);

    expect(state.mapFormsToSettings()).toContainEqual({
      Name: 'keep-versions',
      Value: '5',
    });
  });
});
