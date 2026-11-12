import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { PurgeFilesState } from '../purge-files.state';
import PurgeSelectFilesComponent from './select-files.component';

describe('file removal selection exit navigation', () => {
  afterEach(() => TestBed.resetTestingModule());
  it('exposes Exit as a home link while Continue keeps its selection gate', () => {
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
            versions: signal([]),
            isLoadingVersions: signal(false),
            selectedVersion: signal(null),
            selectedPaths,
            selectedPathsArray: computed(() => selectedPaths().split('\0').filter(Boolean)),
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(PurgeSelectFilesComponent);
    fixture.detectChanges();
    const exit = fixture.nativeElement.querySelector('.form-actions > :first-child') as HTMLElement;
    expect(exit.tagName).toBe('A');
    expect(exit.getAttribute('href')).toBe('/');
    const next = fixture.nativeElement.querySelector('.form-actions > :last-child') as HTMLButtonElement;
    expect(next.tagName).toBe('BUTTON');
    expect(next.disabled).toBe(true);
    selectedPaths.set('/archive/report.txt');
    fixture.detectChanges();
    expect(next.disabled).toBe(false);
    expect(exit.getAttribute('href')).toBe('/');
  });
});
