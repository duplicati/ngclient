import { Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { DuplicatiServer } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { PurgeFilesState } from '../purge-files.state';
import PurgeSelectFilesComponent from './select-files.component';

@Component({
  selector: 'app-file-tree',
  inputs: ['rootPaths', 'backupSettings', 'multiSelect', 'showFiles', 'searchMode', 'searchResults'],
  template: '<ng-content />',
})
class FileTreeStub {}

describe('file removal selection exit navigation', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('exposes Exit as a home link and enables Continue when a path is entered', async () => {
    const selectedPaths = signal('');
    TestBed.configureTestingModule({
      imports: [PurgeSelectFilesComponent],
      providers: [
        provideRouter([]),
        { provide: DuplicatiServer, useValue: {} },
        { provide: SysinfoState, useValue: { hasV2ListOperations: signal(false) } },
        {
          provide: PurgeFilesState,
          useValue: {
            versions: signal([{ Version: 0, Time: '2026-01-01T00:00:00Z' }]),
            isLoadingVersions: signal(false),
            selectedVersion: signal(null),
            selectedPaths,
            selectedPathsArray: computed(() => selectedPaths().split('\0').filter(Boolean)),
          },
        },
      ],
    });
    TestBed.overrideComponent(PurgeSelectFilesComponent, {
      remove: { imports: [FileTreeComponent] },
      add: { imports: [FileTreeStub] },
    });
    const fixture = TestBed.createComponent(PurgeSelectFilesComponent);
    fixture.componentInstance.showFileTree.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const exit = fixture.nativeElement.querySelector('.form-actions > :first-child') as HTMLElement;
    expect(exit.tagName).toBe('A');
    expect(exit.getAttribute('href')).toBe('/');
    const next = fixture.nativeElement.querySelector('.form-actions > :last-child') as HTMLButtonElement;
    expect(next.tagName).toBe('BUTTON');
    expect(next.disabled).toBe(true);
    const path = fixture.nativeElement.querySelector('#path') as HTMLInputElement;
    path.value = '/archive/report.txt';
    path.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(selectedPaths()).toBe('/archive/report.txt');
    expect(next.disabled).toBe(false);
    selectedPaths.set('');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(path.value).toBe('');
    expect(next.disabled).toBe(true);
    expect(exit.getAttribute('href')).toBe('/');
  });
});
