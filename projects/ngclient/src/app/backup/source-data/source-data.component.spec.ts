import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
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

describe('SourceDataComponent form contracts', () => {
  let fixture: ComponentFixture<SourceDataComponent>;
  let state: BackupState;
  const navigate = vi.fn();
  const original = '/documents/\0/music/\0-*.tmp';

  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function render() {
    TestBed.configureTestingModule({
      imports: [SourceDataComponent],
      providers: [
        BackupState,
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
        { provide: ShipDialogService, useValue: {} },
        { provide: DuplicatiServer, useValue: { postApiV1Filesystem: () => of([]) } },
        { provide: TimespanLiteralsService, useValue: {} },
        { provide: WebModulesService, useValue: {} },
        { provide: ServerSettingsService, useValue: {} },
        { provide: ConnectionStringsState, useValue: { destinations: signal([]) } },
        { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/', OSType: 'Linux' }),
            filterGroups: signal({}),
            hasV2FilterOperations: () => false,
            hasV2ListBackendOperations: () => false,
            resolveShorthandPath: (path: string) => path,
          },
        },
      ],
    });
    state = TestBed.inject(BackupState);
    state.backupId.set('new');
    state.sourceDataForm.controls.path.setValue(original);
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
    await input('app-size input[type="number"]', '25');
    expect(state.sourceDataForm.controls.excludes.controls.filesLargerThan.value).toEqual({ size: 25, unit: 'MB' });
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
});
