import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NEVER } from 'rxjs';
import { expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { PurgeFilesState } from '../purge-files.state';
import PurgeSelectFilesComponent from './select-files.component';

it('loads the selected version and clears paths and search from the previous version', async () => {
  HTMLElement.prototype.showPopover ??= vi.fn();
  HTMLElement.prototype.hidePopover ??= vi.fn();
  const latest = { Version: 0, Time: '2026-11-20T12:00:00Z' };
  const older = { Version: 1, Time: '2026-11-19T12:00:00Z' };
  const selectedVersion = signal<string | null>('0');
  const selectedPaths = signal('/report.txt');
  const listFolder = vi.fn(() => NEVER);
  TestBed.configureTestingModule({
    imports: [PurgeSelectFilesComponent],
    providers: [
      provideRouter([]),
      { provide: DuplicatiServer, useValue: { postApiV2BackupListFolder: listFolder } },
      { provide: SysinfoState, useValue: { hasV2ListOperations: signal(false) } },
      {
        provide: PurgeFilesState,
        useValue: {
          versions: signal([latest, older]),
          isLoadingVersions: signal(false),
          backupId: signal('42'),
          selectedVersion,
          selectedPaths,
          selectedPathsArray: computed(() => selectedPaths().split('\0').filter(Boolean)),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(PurgeSelectFilesComponent);
  const component = fixture.componentInstance;
  component.searchQuery.set('report');
  component.searchResults.set([
    {
      ...latest,
      Path: '/report.txt',
      Size: 1,
      IsDirectory: false,
      IsSymlink: false,
      LastModified: latest.Time,
      Metadata: null,
    },
  ]);
  component.hasSearched.set(true);
  const render = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
  };
  await render();
  expect(selectedPaths()).toBe('/report.txt');
  expect(component.searchQuery()).toBe('report');
  const select = fixture.nativeElement.querySelector('sh-select') as HTMLElement;
  expect(select.querySelector('input')?.value).toBe('0');
  select.querySelector<HTMLElement>('sh-form-field')!.click();
  await render();
  Array.from(select.querySelectorAll<HTMLElement>('li.option'))
    .find((option) => option.textContent.trim().startsWith('1:'))!
    .click();
  await render();

  expect(selectedVersion()).toBe('1');
  expect(selectedPaths()).toBe('');
  expect(component.searchQuery()).toBe('');
  expect(component.searchResults()).toEqual([]);
  expect(component.isSearchMode()).toBe(false);
  expect(listFolder).toHaveBeenCalledTimes(2);
  expect(listFolder).toHaveBeenLastCalledWith({
    body: expect.objectContaining({ BackupId: '42', Time: older.Time }),
  });
});
