import { DecimalPipe } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { BackupDto, CommandLineLogOutputDto, DuplicatiServer, IListResultFileset } from '../../core/openapi';
import { buildCompareCommand, parseCompareOutput } from './compare-output';
import CompareVersionsComponent from './compare-versions.component';

const BACKUP = {
  ID: '7',
  Name: 'Documents',
  TargetURL: 'file:///backups/documents',
  DBPath: '/data/documents.sqlite',
  Settings: [
    { Name: 'passphrase', Value: 'secret' },
    { Name: '--dbpath', Value: '/other.sqlite' },
    { Name: '--full-result', Value: 'false' },
    { Name: '--number-of-retries', Value: '3' },
  ],
} as BackupDto;

// The output of the server's COMPARE command, with its own indentation and spelling
const OUTPUT = [
  'Listing changes',
  '  2: 11/1/2026 10:00:00 AM',
  '  1: 11/2/2026 10:00:01 AM',
  '',
  'Size of backup 2: 1.95 KiB',
  '',
  '  2 added entries:',
  '  + /home/user/new/',
  '  + /home/user/new/- notes.txt',
  '',
  '  1 modified entries:',
  '  ~ /home/user/report.docx',
  '',
  '1 deleted entries:',
  '  - C:\\Users\\user\\old\\',
  '',
  '',
  '  Added folders:     1',
  '  Added files:       1',
  '  Deleted folders:   1',
  '  Modified symlinka: 2',
  '  Modified files:    1',
  'Size of backup 1: 2.10 KiB',
];

describe('buildCompareCommand', () => {
  it('compares the two versions with the settings of the backup and lists every change', () => {
    expect(buildCompareCommand(BACKUP, 2, 1)).toEqual([
      'compare',
      'file:///backups/documents',
      '2',
      '1',
      '--backup-name=Documents',
      '--dbpath=/data/documents.sqlite',
      '--backup-id=7',
      '--passphrase=secret',
      '--number-of-retries=3',
      '--full-result',
      '--disable-module=console-password-input',
    ]);
  });
});

describe('parseCompareOutput', () => {
  it('reads the changes, the totals and the sizes', () => {
    expect(parseCompareOutput(OUTPUT)).toEqual({
      changes: [
        { type: 'added', path: '/home/user/new/', isFolder: true },
        { type: 'added', path: '/home/user/new/- notes.txt', isFolder: false },
        { type: 'modified', path: '/home/user/report.docx', isFolder: false },
        { type: 'deleted', path: 'C:\\Users\\user\\old\\', isFolder: true },
      ],
      totals: {
        added: { files: 1, folders: 1, symlinks: 0 },
        modified: { files: 1, folders: 0, symlinks: 2 },
        deleted: { files: 0, folders: 1, symlinks: 0 },
      },
      baseSize: '1.95 KiB',
      targetSize: '2.10 KiB',
      omitted: 0,
    });
  });

  it('ignores what the command logs before the comparison and reads output delivered in one piece', () => {
    const result = parseCompareOutput([
      'The operation ListChanges has started',
      '  - not a change',
      OUTPUT.join('\r\n'),
    ]);
    expect(result?.changes).toHaveLength(4);
  });

  it('counts the entries the server leaves out', () => {
    const result = parseCompareOutput(['Listing changes', '  12 added entries:', '  + /a', '  ... and 11 more', '']);
    expect(result?.changes).toEqual([{ type: 'added', path: '/a', isFolder: false }]);
    expect(result?.omitted).toBe(11);
  });

  it('reads a comparison without changes', () => {
    const result = parseCompareOutput([
      'Listing changes',
      '  1: a',
      '  0: b',
      '',
      'Size of backup 1: 1 KiB',
      '',
      '',
      '  No changes found',
      'Size of backup 0: 1 KiB',
    ]);
    expect(result?.changes).toEqual([]);
    expect(result?.targetSize).toBe('1 KiB');
  });

  it('returns null when the command failed', () => {
    expect(parseCompareOutput(['ErrorID: NeedTwoBackupsToStartDiff', 'Return code: 100'])).toBeNull();
  });
});

describe('CompareVersionsComponent', () => {
  const FILESETS: IListResultFileset[] = [
    { Version: 0, Time: '2026-11-03T10:00:01+01:00' },
    { Version: 1, Time: '2026-11-02T10:00:01+01:00', Label: 'Before upgrade' },
    { Version: 2, Time: '2026-11-01T10:00:00+01:00' },
  ];

  afterEach(() => TestBed.resetTestingModule());

  async function render(
    inputs: { base?: string; target?: string } = {},
    responses: CommandLineLogOutputDto[] = [
      { Started: true, Finished: true, Offset: 0, Count: OUTPUT.length, Items: OUTPUT },
    ],
    filesets = FILESETS,
    serverKnown = true
  ) {
    const start = vi.fn(() => Promise.resolve({ Status: 'OK', ID: 'run-1' }));
    const read = vi.fn(() => Promise.resolve(responses.length > 1 ? responses.shift()! : responses[0]));
    const abort = vi.fn(() => Promise.resolve({}));
    const serverState = signal<{ ProgramState: string } | undefined>(
      serverKnown ? { ProgramState: 'Running' } : undefined
    );
    TestBed.configureTestingModule({
      imports: [CompareVersionsComponent],
      providers: [
        DecimalPipe,
        provideRouter([]),
        {
          provide: StatusBarState,
          useValue: { serverState, resumeDialogCheck: (cb: () => void) => cb() },
        },
        {
          provide: DuplicatiServer,
          useValue: {
            getApiV1BackupById: () => Promise.resolve({ Backup: BACKUP }),
            getApiV1BackupByIdFilesets: () => Promise.resolve(filesets),
            postApiV1Commandline: start,
            getApiV1CommandlineByRunid: read,
            postApiV1CommandlineByRunidAbort: abort,
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(CompareVersionsComponent);
    fixture.componentRef.setInput('id', '7');
    if (inputs.base !== undefined) fixture.componentRef.setInput('base', inputs.base);
    if (inputs.target !== undefined) fixture.componentRef.setInput('target', inputs.target);
    const settle = async () => {
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    return {
      fixture,
      component: fixture.componentInstance,
      el: fixture.nativeElement as HTMLElement,
      start,
      serverState,
      read,
      abort,
      settle,
    };
  }

  it('offers the newest version and the one before it without comparing them', async () => {
    const { component, start } = await render();

    expect(component.baseVersion()).toBe('1');
    expect(component.targetVersion()).toBe('0');
    expect(component.canCompare()).toBe(true);
    expect(start).not.toHaveBeenCalled();
  });

  it('compares the versions of a link right away and shows the changes', async () => {
    const { component, start, read } = await render({ base: '2', target: '1' });
    await vi.waitFor(() => expect(component.state().status).toBe('done'));

    expect(start).toHaveBeenCalledExactlyOnceWith({ body: buildCompareCommand(BACKUP, 2, 1) });
    expect(read).toHaveBeenCalledWith({ path: { runid: 'run-1' }, query: { offset: 0, pagesize: 1000 } });
    expect(component.result()?.changes).toHaveLength(4);
    expect(component.totalCount('added')).toBe(2);
  });

  it('renders the changes and filters them by path and kind', async () => {
    const { component, el, settle } = await render({ base: '2', target: '1' });
    await vi.waitFor(() => expect(component.state().status).toBe('done'));
    await settle();

    const paths = () => Array.from(el.querySelectorAll('.change .path')).map((x) => x.textContent?.trim());
    expect(paths()).toEqual([
      '/home/user/new/',
      '/home/user/new/- notes.txt',
      '/home/user/report.docx',
      'C:\\Users\\user\\old\\',
    ]);
    expect(el.querySelector('.summary-card.added .count')?.textContent).toBe('2');

    component.updateFilter('NEW');
    await settle();
    expect(paths()).toEqual(['/home/user/new/', '/home/user/new/- notes.txt']);

    component.updateFilter('');
    (el.querySelector('.type-toggle.added') as HTMLButtonElement).click();
    await settle();
    expect(paths()).toEqual(['/home/user/report.docx', 'C:\\Users\\user\\old\\']);
  });

  it('waits for the state of the server before comparing the versions of a link', async () => {
    const { component, start, serverState, settle } = await render(
      { base: '2', target: '1' },
      undefined,
      FILESETS,
      false
    );
    expect(start).not.toHaveBeenCalled();

    serverState.set({ ProgramState: 'Running' });
    await settle();
    await vi.waitFor(() => expect(component.state().status).toBe('done'));

    expect(start).toHaveBeenCalledOnce();
  });

  it('ignores versions of a link that the backup does not have', async () => {
    const { component, start } = await render({ base: '9', target: '1' });

    expect(component.baseVersion()).toBe('1');
    expect(component.targetVersion()).toBe('0');
    expect(start).not.toHaveBeenCalled();
  });

  it('does not compare a version with itself', async () => {
    const { component, start } = await render();
    component.baseVersion.set('0');

    expect(component.canCompare()).toBe(false);
    component.compare();
    expect(start).not.toHaveBeenCalled();
  });

  it('reads the output page by page', async () => {
    const { component, read } = await render({ base: '2', target: '1' }, [
      { Started: true, Finished: true, Offset: 0, Count: OUTPUT.length, Pagesize: 4, Items: OUTPUT.slice(0, 4) },
      { Started: true, Finished: true, Offset: 4, Count: OUTPUT.length, Pagesize: 4, Items: OUTPUT.slice(4) },
    ]);
    await vi.waitFor(() => expect(component.state().status).toBe('done'));

    expect(read).toHaveBeenCalledTimes(2);
    expect(read).toHaveBeenLastCalledWith({ path: { runid: 'run-1' }, query: { offset: 4, pagesize: 1000 } });
    expect(component.result()?.changes).toHaveLength(4);
  });

  it('shows the output when the command fails', async () => {
    const output = ['ErrorID: DatabaseDoesNotExist', 'Return code: 100'];
    const { component, el, settle } = await render({ base: '2', target: '1' }, [
      { Started: true, Finished: true, Offset: 0, Count: 2, Items: output },
    ]);
    await vi.waitFor(() => expect(component.state().status).toBe('failed'));
    await settle();

    expect(el.querySelector('[role=alert]')?.textContent).toContain('The versions could not be compared.');
    expect(el.querySelector('.output')?.textContent).toContain('ErrorID: DatabaseDoesNotExist');
  });

  it('aborts a comparison that is still running when the page is left', async () => {
    const { component, fixture, abort } = await render({ base: '2', target: '1' }, [
      { Started: true, Finished: false, Offset: 0, Count: 0, Items: [] },
    ]);
    await vi.waitFor(() => expect(component.state().status).toBe('running'));

    fixture.destroy();

    expect(abort).toHaveBeenCalledExactlyOnceWith({ path: { runid: 'run-1' } });
  });

  it('explains that two versions are needed', async () => {
    const { el } = await render({}, undefined, FILESETS.slice(0, 1));
    expect(el.textContent).toContain('This backup needs at least two versions to compare.');
  });
});
