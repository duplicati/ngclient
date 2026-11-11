import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupDto, DuplicatiServer } from '../../core/openapi';
import { TimespanLiteralsService } from '../../core/services/timespan-literals.service';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';
import OptionsComponent from './options.component';

describe('OptionsComponent form bindings', () => {
  let fixture: ComponentFixture<OptionsComponent>;
  let state: BackupState;

  async function render(settings: { Name: string; Value: string }[], sync = false) {
    TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: TimespanLiteralsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal(null),
            hasSyncSnapshots: signal(true),
            allOptions: signal([]),
            allOptionsGrouped: signal([]),
          },
        },
      ],
    });
    state = TestBed.inject(BackupState);
    state.generalForm.controls.operationType.setValue(sync ? 'Sync' : 'Backup');
    state.mapOptionsToForms({ Settings: settings } as BackupDto);
    fixture = TestBed.createComponent(OptionsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function input(selector: string, value: string) {
    const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    await fixture.whenStable();
    return element;
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  it.each([
    ['keep-versions', '5', '#backupRetentionVersions', '7'],
    ['keep-time', '3D', '#backupRetentionTime', '9'],
    ['retention-policy', '7D:1D,U:1M', '#backupRetentionCustom', '14D:1D,U:1M'],
  ])('loads and edits %s through the rendered control', async (Name, Value, selector, edited) => {
    await render([{ Name, Value }]);
    expect(state.mapFormsToSettings()).toContainEqual({ Name, Value });
    const element = await input(selector, edited);
    expect(state.mapFormsToSettings()).toContainEqual({ Name, Value: Name === 'keep-time' ? '9D' : edited });
    expect(element.value).toBe(edited);
  });

  it('keeps an empty number null and resets the form without disconnecting the rendered input', async () => {
    await render([{ Name: 'keep-versions', Value: '5' }]);
    await input('#backupRetentionVersions', '');
    expect(state.optionsModel().backupRetentionVersions).toBeNull();
    state.optionsForm().reset({ ...state.optionsModel(), backupRetentionVersions: 12 });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#backupRetentionVersions').value).toBe('12');
    expect(state.optionsForm().dirty()).toBe(false);
  });

  it('loads snapshot controls and serializes checkbox and number edits for Sync jobs', async () => {
    await render(
      [
        { Name: 'sync-snapshot-folders', Value: 'true' },
        { Name: 'sync-keep-snapshots', Value: '3' },
        { Name: 'sync-snapshot-disable-hardlinks', Value: 'true' },
      ],
      true
    );
    expect(fixture.nativeElement.querySelector('#syncKeepSnapshots').value).toBe('3');
    await input('#syncKeepSnapshots', '8');
    (fixture.nativeElement.querySelector('#syncSnapshotDisableHardlinks') as HTMLInputElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(state.mapFormsToSettings()).toEqual(
      expect.arrayContaining([
        { Name: '--sync-snapshot-folders', Value: 'True' },
        { Name: '--sync-keep-snapshots', Value: '8' },
      ])
    );
    expect(
      state
        .mapFormsToSettings()
        .some((setting) => setting.Name?.replace(/^--/, '') === 'sync-snapshot-disable-hardlinks')
    ).toBe(false);
  });
});
