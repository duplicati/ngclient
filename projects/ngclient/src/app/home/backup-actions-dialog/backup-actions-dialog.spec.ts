import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupAction, BackupActionsDialog, BackupActionsDialogData } from './backup-actions-dialog';

describe('backup actions dialog', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(data: Partial<BackupActionsDialogData> = {}, features = true) {
    const flag = signal(features);
    TestBed.configureTestingModule({
      providers: [
        {
          provide: SysinfoState,
          useValue: {
            hasSyncRestore: flag,
            hasSkipNextRun: flag,
            hasBackupEnableDisable: flag,
            hasV2RestoreTest: flag,
            hasV2SetVersionLabel: flag,
            hasV2DeleteVersions: flag,
            hasV2PurgeFiles: flag,
            hasV2BrokenFiles: flag,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(BackupActionsDialog);
    fixture.componentRef.setInput('data', {
      id: '42',
      name: 'Documents',
      isSync: false,
      isExternal: false,
      isDisabled: false,
      ...data,
    });
    const emitted: Array<BackupAction | null> = [];
    fixture.componentInstance.closed.subscribe((x) => emitted.push(x));
    fixture.detectChanges();
    const ids = () =>
      fixture.componentInstance
        .groups()
        .flatMap((x) => x.actions)
        .map((x) => x.id);
    return { fixture, emitted, ids };
  }

  it('lists every action in groups, titled with the backup name', () => {
    const { fixture, ids } = setup();

    expect(fixture.nativeElement.querySelector('h3').textContent).toContain('Documents');
    expect(fixture.componentInstance.groups().map((x) => x.title)).toEqual([
      'Operations',
      'Versions',
      'Verify and repair',
      'Advanced',
    ]);
    expect(ids()).toEqual([
      'restore',
      'export',
      'disable',
      'delete',
      'compare',
      'version-labels',
      'delete-versions',
      'purge-files',
      'verify',
      'test-restore',
      'database',
      'broken-files',
      'commandline',
      'log',
    ]);
  });

  it('emits the picked action with its route', () => {
    const { fixture, emitted } = setup();

    const buttons: HTMLButtonElement[] = Array.from(fixture.nativeElement.querySelectorAll('button.action'));
    buttons.find((x) => x.getAttribute('aria-label') === 'Export')!.click();

    expect(emitted.map((x) => [x?.id, x?.route])).toEqual([['export', ['/backup', '42', 'export']]]);
  });

  it('offers to enable a disabled backup', () => {
    const { ids } = setup({ isDisabled: true });

    expect(ids()).toContain('enable');
    expect(ids()).not.toContain('disable');
  });

  it('leaves out export and delete for externally managed backups', () => {
    const { ids } = setup({ isExternal: true });

    expect(ids()).not.toContain('export');
    expect(ids()).not.toContain('delete');
    expect(ids()).toContain('restore');
  });

  it('leaves out the backup-only actions for sync jobs', () => {
    const { fixture, ids } = setup({ isSync: true }, false);

    expect(ids()).toEqual(['export', 'delete', 'database', 'commandline', 'log']);
    expect(fixture.componentInstance.groups().map((x) => x.title)).toEqual(['Operations', 'Advanced']);
  });

  it('emits null when closed', () => {
    const { fixture, emitted } = setup();

    fixture.nativeElement.querySelector('header button').click();

    expect(emitted).toEqual([null]);
  });
  it('offers skipping only for enabled scheduled jobs on supported servers', () => {
    const { fixture, ids } = setup({ isScheduled: true });
    expect(ids()).toContain('skip-next-run');
    fixture.componentRef.setInput('data', {
      id: '42',
      name: 'Documents',
      isSync: false,
      isExternal: false,
      isDisabled: true,
      isScheduled: true,
    });
    fixture.detectChanges();
    expect(ids()).not.toContain('skip-next-run');
  });

  it('does not offer skipping without server support', () => {
    expect(setup({ isScheduled: true }, false).ids()).not.toContain('skip-next-run');
  });
});
