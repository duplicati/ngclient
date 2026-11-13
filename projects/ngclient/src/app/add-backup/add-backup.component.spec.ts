import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { SysinfoState } from '../core/states/sysinfo.state';
import AddBackupComponent from './add-backup.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusBarStub {}

describe('AddBackup navigation', () => {
  let fixture: ComponentFixture<AddBackupComponent>;
  const hasRestoreControlFilesOperation = signal(false);

  beforeEach(() => {
    hasRestoreControlFilesOperation.set(false);
    TestBed.configureTestingModule({
      imports: [AddBackupComponent],
      providers: [provideRouter([]), { provide: SysinfoState, useValue: { hasRestoreControlFilesOperation } }],
    });
    TestBed.overrideComponent(AddBackupComponent, {
      remove: { imports: [StatusBarComponent] },
      add: { imports: [StatusBarStub] },
    });
    fixture = TestBed.createComponent(AddBackupComponent);
    fixture.detectChanges();
  });

  afterEach(() => TestBed.resetTestingModule());

  function links() {
    return Array.from(fixture.nativeElement.querySelectorAll('a') as NodeListOf<HTMLAnchorElement>).map((link) =>
      link.getAttribute('href')
    );
  }

  it('provides new-backup and file-import links without requiring the remote import capability', () => {
    expect(links()).toEqual(['/backup/new', '/backup/import']);
    expect(fixture.nativeElement.querySelectorAll('sh-card')).toHaveLength(2);
    expect(fixture.nativeElement.querySelector('.three-column')).toBeNull();
  });

  it('keeps the remote-import link and layout conditional on the server capability', () => {
    hasRestoreControlFilesOperation.set(true);
    fixture.detectChanges();
    expect(links()).toEqual(['/backup/new', '/backup/import', '/backup/import-destination']);
    expect(fixture.nativeElement.querySelectorAll('sh-card')).toHaveLength(3);
    expect(fixture.nativeElement.querySelector('.three-column')).not.toBeNull();
    hasRestoreControlFilesOperation.set(false);
    fixture.detectChanges();
    expect(links()).toEqual(['/backup/new', '/backup/import']);
    expect(fixture.nativeElement.querySelectorAll('sh-card')).toHaveLength(2);
  });
});
