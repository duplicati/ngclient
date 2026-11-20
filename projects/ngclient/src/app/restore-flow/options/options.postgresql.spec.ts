import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import OptionsComponent, { createRestoreOptionsForm } from './options.component';

const SOURCE_URL =
  'postgresql://?postgresql-host=db.example.com&postgresql-port=5432&postgresql-database=app&postgresql-username=backup';
const OTHER_URL =
  'postgresql://?postgresql-host=other.example.com&postgresql-port=5432&postgresql-database=copy&postgresql-username=restore';

describe('Restore options for a PostgreSQL backup', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(
    values: Partial<ReturnType<ReturnType<typeof createRestoreOptionsForm>['getRawValue']>>,
    restoreModules: string[],
    filesToRestore = '/backup/'
  ) {
    const optionsForm = createRestoreOptionsForm();
    optionsForm.patchValue({ handleExisting: 'overwrite', ...values });
    const optionsFormSignal = signal(optionsForm.getRawValue());
    optionsForm.valueChanges.subscribe(() => optionsFormSignal.set(optionsForm.getRawValue()));
    const submit = vi.fn();
    const setAlternateRestorePath = vi.fn();
    const setAdditionalRestorePaths = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        {
          provide: RestoreFlowState,
          useValue: {
            optionsForm,
            optionsFormSignal,
            isSubmitting: signal(false),
            extendedDataType: signal('postgresql'),
            advancedOptions: signal([]),
            canRegisterRestoredItems: signal(false),
            backup: signal({ Backup: { ID: '1', Sources: [`@/backup|${SOURCE_URL}`] } }),
            selectFilesFormSignal: signal({ filesToRestore }),
            submit,
            setAlternateRestorePath,
            setAdditionalRestorePaths,
          },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            hasRestoreOptions: signal(true),
            restoreDestinationProviderModules: signal(restoreModules.map((Key) => ({ Key }))),
          },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
      ],
    }).overrideComponent(OptionsComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(OptionsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, optionsForm, submit, setAlternateRestorePath, setAdditionalRestorePaths, open };
  }

  it('offers a database as the target only when the server can restore to one', () => {
    expect(setup({ restoreFrom: 'pickLocation' }, ['postgresql']).component.canRestoreToDatabase()).toBe(true);
    TestBed.resetTestingModule();
    expect(setup({ restoreFrom: 'pickLocation' }, ['office365']).component.canRestoreToDatabase()).toBe(false);
  });

  it('checks the database as the target of a restore', () => {
    const { component, open } = setup({ restoreFrom: 'same-custom' }, ['postgresql']);

    component.checkPermissions();

    expect(open).toHaveBeenCalledTimes(1);
    expect(open.mock.calls[0][1].data).toMatchObject({ module: 'postgresql', mode: 'restore' });
    expect(open.mock.calls[0][1].data.url).toContain('postgresql://');
  });

  it('shows no path tree for a database and names the target', () => {
    const { component } = setup({ restoreFrom: 'same-custom' }, ['postgresql']);

    expect(component.isDatabaseTarget()).toBe(true);
    expect(component.showCustomRemoteRestoreTree()).toBe(false);
    expect(component.customRemoteTreeMode()).toBeNull();
    expect(component.canCheckPermissions()).toBe(true);
    expect(component.databaseTarget()).toEqual({
      host: 'db.example.com',
      port: '5432',
      database: 'app',
      username: 'backup',
    });
  });

  it('restores to the source database without replacing tables unless asked', () => {
    const { component, optionsForm, submit, setAlternateRestorePath } = setup({ restoreFrom: 'same-custom' }, [
      'postgresql',
    ]);

    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(`@${SOURCE_URL}`, '@/backup');
    expect(optionsForm.controls.handleExisting.value).toBe('saveTimestamp');
    expect(optionsForm.controls.includeMetadata.value).toBe(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('restores a version from a failed backup only when asked', () => {
    const { component, setAlternateRestorePath, setAdditionalRestorePaths } = setup(
      { restoreFrom: 'same-custom', databaseAllowMixedVersions: true, databaseCreateTables: true },
      ['postgresql']
    );

    expect(component.isDatabaseTablesOnly()).toBe(false);
    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(
      `@${SOURCE_URL}&postgresql-restore-allow-mixed-versions=true`,
      '@/backup'
    );
    expect(setAdditionalRestorePaths).not.toHaveBeenCalled();
  });

  it('loads only the rows when some of the database is selected, and restores the table of contents too', () => {
    const { component, optionsForm, submit, setAlternateRestorePath, setAdditionalRestorePaths } = setup(
      { restoreFrom: 'other-custom', databaseAllowMixedVersions: true },
      ['postgresql'],
      '/backup/tables/app.orders\0/backup/tables/app.customers'
    );
    component.remoteCustomTargetUrl.set(OTHER_URL);

    expect(component.isDatabaseTablesOnly()).toBe(true);
    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(`@${OTHER_URL}&postgresql-restore-mode=tables`, '@/backup');
    expect(setAdditionalRestorePaths).toHaveBeenCalledWith(['/backup/toc']);
    expect(optionsForm.controls.handleExisting.value).toBe('saveTimestamp');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('creates missing tables and replaces rows when asked', () => {
    const { component, optionsForm, setAlternateRestorePath } = setup(
      { restoreFrom: 'same-custom', databaseCreateTables: true, databaseOverwrite: true, handleExisting: 'saveTimestamp' },
      ['postgresql'],
      '/backup/tables/'
    );

    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(
      `@${SOURCE_URL}&postgresql-restore-mode=tables&postgresql-restore-create-tables=true`,
      '@/backup'
    );
    expect(optionsForm.controls.handleExisting.value).toBe('overwrite');
  });

  it('restores to another database, replacing tables when asked', () => {
    const { component, optionsForm, submit, setAlternateRestorePath } = setup(
      { restoreFrom: 'other-custom', databaseOverwrite: true, handleExisting: 'saveTimestamp' },
      ['postgresql']
    );
    component.remoteCustomTargetUrl.set(OTHER_URL);

    expect(component.databaseTarget()?.database).toBe('copy');
    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(`@${OTHER_URL}`, '@/backup');
    expect(optionsForm.controls.handleExisting.value).toBe('overwrite');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not start a restore to another database before one is chosen', () => {
    const { component, submit, setAlternateRestorePath, open } = setup({ restoreFrom: 'other-custom' }, [
      'postgresql',
    ]);

    component.submit();

    expect(open).toHaveBeenCalledTimes(1);
    expect(setAlternateRestorePath).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
  });

  it('restores the tables as files to a folder', () => {
    const { component, submit, setAlternateRestorePath } = setup(
      { restoreFrom: 'pickLocation', restoreFromPath: '/restore' },
      ['postgresql']
    );

    expect(component.isDatabaseTarget()).toBe(false);
    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledWith(null, null);
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
