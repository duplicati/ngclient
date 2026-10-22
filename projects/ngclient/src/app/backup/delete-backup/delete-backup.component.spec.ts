import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import DeleteBackupComponent from './delete-backup.component';

afterEach(() => TestBed.resetTestingModule());

describe('job deletion remote files option', () => {
  async function setup(operationType?: 'Backup' | 'Sync') {
    const remove = vi.fn(() => of({}));
    const open = vi.fn((_component: unknown, _options: { closed: (confirmed: boolean) => void }) => {});
    TestBed.configureTestingModule({
      imports: [DeleteBackupComponent],
      providers: [
        DecimalPipe,
        provideRouter([]),
        { provide: ShipDialogService, useValue: { open } },
        { provide: DuplicatiServer, useValue: { postApiV1FilesystemValidate: vi.fn(() => Promise.resolve({})) } },
        {
          provide: BackupsState,
          useValue: {
            getBackupById: () => ({
              Backup: {
                ID: '42',
                Name: 'Test job',
                OperationType: operationType,
                DBPath: '/db',
                Metadata: { TargetFilesCount: '2' },
              },
            }),
            deleteBackup: remove,
          },
        },
      ],
    });
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(DeleteBackupComponent);
    fixture.componentRef.setInput('id', '42');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, remove, open };
  }

  it('hides the entire remote files section for Sync while retaining local database deletion', async () => {
    const { fixture } = await setup('Sync');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Delete local database');
    expect(text).not.toContain('Delete remote files');
    expect(text).not.toContain('from the remote storage?');
    expect(fixture.nativeElement.querySelectorAll('input[type="checkbox"]').length).toBe(1);
  });

  it.each([false, true])('omits the remote option for Sync even when its signal is %s', async (selected) => {
    const { component, open, remove } = await setup('Sync');
    component.deleteLocalDb.set(true);
    component.deleteRemoteFiles.set(selected);
    component.deleteBackup();
    open.mock.calls[0][1].closed(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith({ path: { id: '42' }, query: { 'delete-local-db': true } });
  });

  it.each(['Backup', undefined] as const)('retains remote deletion for operation type %s', async (operationType) => {
    const { fixture, component, open, remove } = await setup(operationType);
    expect(fixture.nativeElement.textContent).toContain('Delete remote files');
    component.deleteRemoteFiles.set(true);
    component.deleteBackup();
    open.mock.calls[0][1].closed(true);
    expect(remove).toHaveBeenCalledExactlyOnceWith({
      path: { id: '42' },
      query: { 'delete-local-db': false, 'delete-remote-files': true },
    });
  });
});
