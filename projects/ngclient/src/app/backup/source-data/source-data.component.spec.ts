import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { TimespanLiteralsService } from '../../core/services/timespan-literals.service';
import { WebModulesService } from '../../core/services/webmodules.service';
import { ConnectionStringsState } from '../../core/states/connection-strings.state';
import { FileTreeState } from '../../core/states/file-tree.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../settings/server-settings.service';
import { BackupState } from '../backup.state';
import SourceDataComponent from './source-data.component';

// The file tree scrolls to a selected remote source on a timer that can outlive a test; jsdom has no scrollIntoView
Element.prototype.scrollIntoView ??= () => {};

describe('SourceDataComponent form contracts', () => {
  let fixture: ComponentFixture<SourceDataComponent>;
  let state: BackupState;
  const navigate = vi.fn();
  const dialogClosed = new Subject<string[] | null>();
  const openDialog = vi.fn((..._args: unknown[]) => ({ closed: dialogClosed }));
  const original = '/documents/\0/music/\0-*.tmp';
  const listFilesystem = vi.fn((..._args: unknown[]) => of([] as unknown[]));

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render(paths = original) {
    const systemInfo = signal({
      DirectorySeparator: '/',
      OSType: 'Linux',
      SpecialFolders: [{ ID: '%HOME%', Path: '/root' }],
    });
    TestBed.configureTestingModule({
      imports: [SourceDataComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: ShipDialogService, useValue: { open: openDialog } },
        { provide: DuplicatiServer, useValue: { postApiV1Filesystem: listFilesystem } },
        { provide: TimespanLiteralsService, useValue: {} },
        { provide: WebModulesService, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
        { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo,
            filterGroups: signal({}),
            hasV2FilterOperations: () => false,
            hasV2ListBackendOperations: () => false,
            resolveShorthandPath(path: string) {
              return SysinfoState.prototype.resolveShorthandPath.call(this as unknown as SysinfoState, path);
            },
          },
        },
      ],
    });
    state = TestBed.inject(BackupState);
    state.backupId.set('new');
    state.sourceDataForm.controls.path.setValue(paths);
    state.sourceDataForm.controls.excludes.controls.filesLargerThan.setValue({ size: 12, unit: 'MB' });
    fixture = TestBed.createComponent(SourceDataComponent);
    await settle();
  }

  async function input(selector: string, value: string) {
    const element = fixture.nativeElement.querySelector(selector) as HTMLInputElement;
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    return element;
  }

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.clearAllMocks();
  });

  it('loads paths, filters and size exclusion without rewriting the shared form', async () => {
    await render();
    expect(state.sourceDataForm.controls.path.value).toBe(original);
    expect(fixture.componentInstance.nonFilterPaths()).toEqual(['/documents/', '/music/']);
    expect(fixture.componentInstance.filters()).toEqual(['-*.tmp']);
    expect(fixture.componentInstance.filesLargerThan()).toBe('12MB');
  });

  it('shows the server folder a shortcut source such as %HOME% points to', async () => {
    await render('%HOME%\0/documents/');
    const rows = [...fixture.nativeElement.querySelectorAll('.paths .path')] as HTMLElement[];
    const texts = rows.map((row) =>
      [...row.querySelectorAll('.source-path-text')].map((x) => x.textContent?.trim()).join(' ')
    );
    expect(texts).toEqual(['Home (/root)', '/documents/']);
    expect(rows.map((row) => row.querySelector('.source-path-text')?.getAttribute('title'))).toEqual([
      '%HOME%',
      '/documents/',
    ]);
    expect(state.sourceDataForm.controls.path.value).toBe('%HOME%\0/documents/');
  });

  it('shows the resolved server folder for a subfolder of a shortcut source', async () => {
    await render('%HOME%/notes/\0%UNKNOWN%/x/');
    expect(fixture.componentInstance.resolvedShortcutPath('%HOME%/notes/')).toBe('/root/notes/');
    expect(fixture.componentInstance.resolvedShortcutPath('%UNKNOWN%/x/')).toBeNull();
    const rows = [...fixture.nativeElement.querySelectorAll('.paths .path')] as HTMLElement[];
    expect(rows[0].querySelector('.source-path-resolved')?.textContent?.trim()).toBe('(/root/notes/)');
    expect(rows[1].querySelector('.source-path-resolved')).toBeNull();
    expect(rows.map((row) => row.querySelector('.source-path-text')?.textContent?.trim())).toEqual([
      'Home/notes',
      '%UNKNOWN%/x/',
    ]);
    expect(rows.map((row) => row.querySelector('.source-path-shortcut')?.textContent)).toEqual(['Home', undefined]);
  });

  it('draws each source with the folder or file icon and badge the folder tree uses', async () => {
    await render('%MY_DOCUMENTS%\0%DESKTOP%/notes/\0/data/report.txt\0%HYPERV%\\abc-123');
    const rows = [...fixture.nativeElement.querySelectorAll('.paths .path')] as HTMLElement[];
    const icons = rows.map((row) =>
      [...row.querySelectorAll('.source-path-icon sh-icon')].map((x) => x.textContent?.trim())
    );
    expect(icons).toEqual([['folder', 'file-text'], ['folder'], ['file'], ['monitor']]);
  });

  it('draws remote sources like local ones without exposing the URL query', async () => {
    await render('@/mnt/dupl-s3|s3://bucket/backups?auth-password=secret\0@/mnt/dupl-disk|diskimage:///dev/sda');
    const rows = [...fixture.nativeElement.querySelectorAll('.paths .path')] as HTMLElement[];
    expect(rows.map((row) => !!row.querySelector('.source-path-icon img.provider-icon'))).toEqual([true, true]);
    const locations = rows.map((row) => row.querySelector('.source-path-resolved')?.textContent?.trim());
    expect(locations).toEqual(['bucket/backups', '/dev/sda']);
    expect(fixture.nativeElement.querySelector('.paths')?.textContent).not.toContain('secret');
  });

  it('names shortcut tokens the way the server folder tree does', async () => {
    await render();
    const component = fixture.componentInstance;
    expect(component.displayPath('%MY_DOCUMENTS%/Screenshots/')).toBe('Documents/Screenshots');
    expect(component.displayPath('%DESKTOP%')).toBe('Desktop');
    expect(component.displayPath('%QNAP_SHARE_Multimedia%/Photos/')).toBe('Multimedia/Photos');
    expect(component.displayPath('%HYPERV%')).toBe('Hyper-V Machines');
    expect(component.displayPath('%HYPERV%\\abc-123')).toBe('Hyper-V Machines\\abc-123');
    expect(component.displayPath('%MSSQL%')).toBe('Microsoft SQL Server');
    expect(component.displayPath('/Applications/')).toBe('/Applications/');
  });

  it('names Hyper-V machines from the server listing and keeps the GUID when unknown', async () => {
    const hypervCalls = () =>
      listFilesystem.mock.calls.filter((call) => (call[0] as { body: { path: string } }).body.path === '%HYPERV%');
    listFilesystem.mockImplementation((options: unknown) =>
      (options as { body: { path: string } }).body.path !== '%HYPERV%'
        ? of([])
        : of([
            { id: '%HYPERV%\\AAAA-1111\\', text: 'AAAA-1111', Metadata: { 'hyperv:Name': 'Web server' } },
            { id: '%HYPERV%\\bbbb-2222', text: 'Build agent' },
          ])
    );
    await render('%HYPERV%\\aaaa-1111\0%HYPERV%\\bbbb-2222\\disk.vhdx\0%HYPERV%\\cccc-3333');
    expect(hypervCalls()).toHaveLength(1);
    const component = fixture.componentInstance;
    expect(component.displayPath('%HYPERV%\\aaaa-1111')).toBe('Hyper-V Machines\\Web server');
    expect(component.displayPath('%HYPERV%\\bbbb-2222\\disk.vhdx')).toBe('Hyper-V Machines\\Build agent\\disk.vhdx');
    expect(component.displayPath('%HYPERV%\\cccc-3333')).toBe('Hyper-V Machines\\cccc-3333');
    listFilesystem.mockImplementation(() => of([]));
  });

  it('does not list Hyper-V machines when no source uses them', async () => {
    await render();
    const paths = listFilesystem.mock.calls.map((call) => (call[0] as { body: { path: string } }).body.path);
    expect(paths).not.toContain('%HYPERV%');
  });

  it('adds a direct path once and clears its input while retaining filters', async () => {
    await render();
    await input('input[placeholder="Add a direct path"]', '/pictures/');
    fixture.componentInstance.addNewPath();
    await settle();
    expect(state.sourceDataForm.controls.path.value).toBe(original + '\0/pictures/');
    expect(fixture.nativeElement.querySelector('input[placeholder="Add a direct path"]').value).toBe('');
    await input('input[placeholder="Add a direct path"]', '/pictures/');
    fixture.componentInstance.addNewPath();
    await settle();
    expect(state.sourceDataForm.controls.path.value).toBe(original + '\0/pictures/');
  });

  it('commits an edited path and discards a cancelled edit', async () => {
    await render();
    fixture.componentInstance.editPath('/documents/');
    await settle();
    await input('input[placeholder="Edit path"]', '/edited/');
    fixture.componentInstance.cancelEditPath();
    await settle();
    expect(state.sourceDataForm.controls.path.value).toBe(original);
    fixture.componentInstance.editPath('/documents/');
    await settle();
    await input('input[placeholder="Edit path"]', '/edited/');
    fixture.componentInstance.updatePath();
    await settle();
    expect(state.sourceDataForm.controls.path.value).toBe('/edited/\0/music/\0-*.tmp');
  });

  it('commits bulk paths only on blur and keeps the existing filters', async () => {
    await render();
    fixture.componentInstance.togglePathBulkEdit();
    await settle();
    const textarea = await input('textarea.bulk-textarea', '/new/\n/other/\n/new/');
    expect(state.sourceDataForm.controls.path.value).toBe(original);
    textarea.dispatchEvent(new Event('blur'));
    await settle();
    expect(state.sourceDataForm.controls.path.value).toBe('/new/\0/other/\0-*.tmp');
  });

  it('round-trips size edits and clearing through the existing shared controls', async () => {
    await render();
    expect(fixture.nativeElement.querySelector('app-size input[type="number"]').value).toBe('12');
    await input('app-size input[type="number"]', '25');
    expect(state.sourceDataForm.controls.excludes.controls.filesLargerThan.value).toEqual({ size: 25, unit: 'MB' });
    await input('app-size sh-select input', 'GB');
    expect(state.sourceDataForm.controls.excludes.controls.filesLargerThan.value).toEqual({ size: 25, unit: 'GB' });
    fixture.componentInstance.toggleFilesLargerThan(false);
    await settle();
    expect(fixture.componentInstance.filesLargerThan()).toBeNull();
    expect(fixture.nativeElement.querySelector('app-size')).toBeNull();
    fixture.componentInstance.toggleFilesLargerThan(true);
    await settle();
    expect(state.sourceDataForm.controls.excludes.controls.filesLargerThan.value).toEqual({ size: 50, unit: 'MB' });
  });

  it('prevents native form submission while retaining the next-step navigation', async () => {
    await render();
    const event = new Event('submit', { bubbles: true, cancelable: true });
    fixture.nativeElement.querySelector('form').dispatchEvent(event);
    await settle();
    expect(event.defaultPrevented).toBe(true);
    expect(navigate).toHaveBeenCalledWith(['destination'], expect.anything());
  });
  it('summarizes the existing attribute option without dropping other flags', async () => {
    await render();
    const settings = [{ Name: '--exclude-files-attributes', Value: ' hIdDeN , SYSTEM,Archive ' }];
    state.settings.set(settings);
    await settle();
    const summary = fixture.nativeElement.querySelector('.attribute-exclusions');
    expect(summary?.textContent).toContain('hIdDeN');
    expect(summary?.textContent).toContain('SYSTEM');
    expect(summary?.textContent).toContain('Archive');
    expect(state.settings()).toEqual(settings);
    expect(fixture.componentInstance.previewAttributes()).toEqual(['hIdDeN', 'SYSTEM']);
  });
  it('edits attribute exclusions in a dialog without leaving the page', async () => {
    await render();
    state.settings.set([
      { Name: '--other', Value: '1' },
      { Name: '--exclude-files-attributes', Value: 'Hidden,Archive' },
    ]);
    await settle();
    fixture.nativeElement.querySelector('.attribute-exclusions button').click();
    expect(navigate).not.toHaveBeenCalled();
    expect(openDialog.mock.lastCall?.[1]).toMatchObject({ data: { selected: ['Hidden', 'Archive'] } });

    dialogClosed.next(null);
    expect(state.settings()[1].Value).toBe('Hidden,Archive');

    dialogClosed.next(['Hidden', 'System']);
    expect(state.settings()).toEqual([
      { Name: '--other', Value: '1' },
      { Name: '--exclude-files-attributes', Value: 'Hidden,System' },
    ]);

    // Clearing removes the job option unless it has to override an inherited value.
    dialogClosed.next([]);
    expect(state.settings()).toEqual([{ Name: '--other', Value: '1' }]);
  });
  it('keeps an empty job override when clearing inherited attribute exclusions', async () => {
    await render();
    state.applicationOptions.set([
      {
        Name: '--exclude-files-attributes',
        Value: 'Hidden',
        Filter: null,
        Argument: { Name: 'exclude-files-attributes', Type: 'Flags' },
      },
    ]);
    await settle();
    fixture.nativeElement.querySelector('.attribute-exclusions button').click();
    dialogClosed.next([]);
    await settle();
    expect(state.settings()).toEqual([{ Name: '--exclude-files-attributes', Value: '' }]);
    expect(fixture.nativeElement.querySelector('.attribute-exclusions').textContent).toContain(
      'No attribute exclusions configured.'
    );
  });
  it('previews inherited attributes but respects an explicitly empty job override', async () => {
    await render();
    state.applicationOptions.set([
      {
        Name: '--exclude-files-attributes',
        Value: 'Hidden,System,ReadOnly',
        Filter: null,
        Argument: { Name: 'exclude-files-attributes', Type: 'Flags' },
      },
    ]);
    await settle();
    expect(fixture.componentInstance.previewAttributes()).toEqual(['Hidden', 'System']);
    expect(fixture.nativeElement.querySelector('.attribute-exclusions').textContent).toContain('ReadOnly');
    state.settings.set([{ Name: '--exclude-files-attributes', Value: '' }]);
    await settle();
    expect(fixture.componentInstance.previewAttributes()).toEqual([]);
    expect(fixture.nativeElement.querySelector('.attribute-exclusions').textContent).toContain(
      'No attribute exclusions configured.'
    );
    expect(state.settings()).toEqual([{ Name: '--exclude-files-attributes', Value: '' }]);
  });
  it('keeps the size limit and attribute exclusions together in the Exclude card', async () => {
    await render();
    const cards = [...fixture.nativeElement.querySelectorAll('app-toggle-card')] as HTMLElement[];
    const exclude = cards.find((card) => card.querySelector('.attribute-exclusions'))!;
    expect(exclude.textContent).toContain('Choose any files you want to exclude.');
    expect(exclude.querySelector('sh-toggle')?.textContent).toContain('Files larger than');
    expect(exclude.querySelector('.attribute-exclusions-title')?.textContent).toBe('File attributes');
    expect(cards.filter((card) => card.querySelector('.attribute-exclusions'))).toHaveLength(1);
  });
});
