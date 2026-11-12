import { DecimalPipe } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { Observable, of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { BackupsState } from '../../core/states/backups.state';
import DeleteBackupComponent from './delete-backup.component';

afterEach(() => TestBed.resetTestingModule());

describe('job deletion remote files option', () => {
  async function setup(operationType?: 'Backup' | 'Sync', response: Observable<unknown> = of({})) {
    const remove = vi.fn(() => response);
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

  it.each(['Backup', 'Sync'] as const)('exposes navigation links without deleting a %s job', async (operationType) => {
    const { fixture, component, remove, open } = await setup(operationType);
    const exportLink = () =>
      Array.from(fixture.nativeElement.querySelectorAll('[shButton]') as NodeListOf<HTMLElement>).find((item) =>
        item.textContent!.includes('Export configuration')
      )!;
    const cancel = fixture.nativeElement.querySelector('.actions [shButton]') as HTMLElement;
    expect(exportLink().tagName).toBe('A');
    expect(exportLink().getAttribute('href')).toBe('/backup/42/export');
    expect(cancel.tagName).toBe('A');
    expect(cancel.getAttribute('href')).toBe('/');
    fixture.componentRef.setInput('id', '43');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(exportLink().getAttribute('href')).toBe('/backup/43/export');
    expect(remove).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(component.isDeleting()).toBe(false);
    expect(fixture.nativeElement.querySelector('.actions button').textContent).toContain('Delete backup');
  });

  it('releases the deletion state after cancellation and allows another attempt', async () => {
    const { component, open, remove, fixture } = await setup();
    component.deleteBackup();
    expect(component.isDeleting()).toBe(true);
    open.mock.calls[0][1].closed(false);
    fixture.detectChanges();
    expect(component.isDeleting()).toBe(false);
    expect(remove).not.toHaveBeenCalled();
    component.deleteBackup();
    expect(open).toHaveBeenCalledTimes(2);
  });

  it('opens only one confirmation and does not start another deletion while pending', async () => {
    const pending = new Subject<unknown>();
    const { component, open, remove } = await setup('Backup', pending);
    component.deleteBackup();
    component.deleteBackup();
    expect(open).toHaveBeenCalledTimes(1);
    open.mock.calls[0][1].closed(true);
    component.deleteBackup();
    expect(open).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
    pending.complete();
    expect(component.isDeleting()).toBe(false);
  });

  it('allows retry after a failed deletion without navigating', async () => {
    const pending = new Subject<unknown>();
    const { component, open } = await setup('Backup', pending);
    const navigate = TestBed.inject(Router).navigate;
    component.deleteBackup();
    open.mock.calls[0][1].closed(true);
    pending.error(new Error('busy'));
    expect(component.isDeleting()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
    component.deleteBackup();
    expect(open).toHaveBeenCalledTimes(2);
    open.mock.calls[1][1].closed(false);
  });

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
