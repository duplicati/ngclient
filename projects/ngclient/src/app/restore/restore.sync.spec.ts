import { Component, signal } from '@angular/core';
import { DeferBlockState, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatusBarComponent from '../core/components/status-bar/status-bar.component';
import { DuplicatiServer, OperationType, SystemInfoDto } from '../core/openapi';
import { BackupsState } from '../core/states/backups.state';
import { SysinfoState } from '../core/states/sysinfo.state';
import RestoreComponent from './restore.component';

@Component({ selector: 'app-status-bar', template: '' })
class StatusBarStub {}

const job = (id: string, name: string, OperationType?: OperationType) => ({
  Backup: { ID: id, Name: name, OperationType, Metadata: { BackupListCount: '2', SourceSizeString: '1 MB' } },
});

describe('Restore job selection includes Sync', () => {
  afterEach(() => TestBed.resetTestingModule());
  async function setup(
    jobs = [
      job('backup', 'Versioned backup', 'Backup'),
      job('sync', 'Local sync', 'Sync'),
      job('legacy', 'Legacy backup'),
    ],
    syncRestore = true
  ) {
    const backups = signal(jobs);
    const getBackups = vi.fn();
    TestBed.configureTestingModule({
      imports: [RestoreComponent],
      providers: [
        provideRouter([]),
        { provide: BackupsState, useValue: { backups, backupsLoading: signal(false), getBackups } },
        { provide: DuplicatiServer, useValue: {} },
      ],
    }).overrideComponent(RestoreComponent, {
      remove: { imports: [StatusBarComponent] },
      add: { imports: [StatusBarStub] },
    });
    await TestBed.compileComponents();
    TestBed.inject(SysinfoState).systemInfo.set({
      APIExtensions: syncRestore ? ['v1:backup:sync-restore'] : [],
    } as SystemInfoDto);
    const fixture = TestBed.createComponent(RestoreComponent);
    fixture.detectChanges();
    const blocks = await fixture.getDeferBlocks();
    await blocks[0].render(DeferBlockState.Complete);
    fixture.detectChanges();
    return { fixture, backups, getBackups };
  }
  it('renders ordinary, legacy and Sync jobs', async () => {
    const { fixture, getBackups } = await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Versioned backup');
    expect(text).toContain('Legacy backup');
    expect(text).toContain('Local sync');
    expect(getBackups).toHaveBeenCalledExactlyOnceWith(true);
  });
  it('leaves Sync jobs out on a server that cannot restore them', async () => {
    const { fixture } = await setup(undefined, false);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Versioned backup');
    expect(text).toContain('Legacy backup');
    expect(text).not.toContain('Local sync');
  });
  it('lists a Sync-only list as restorable jobs next to the direct and config restore cards', async () => {
    const { fixture } = await setup([job('sync', 'Local sync', 'Sync')]);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Local sync');
    expect(text).toContain('Direct restore from backup files');
    expect(text).toContain('Restore from configuration');
  });
  it('updates when live job data changes', async () => {
    const { fixture, backups } = await setup([job('backup', 'Versioned backup', 'Backup')]);
    backups.set([job('backup', 'Versioned backup', 'Backup'), job('sync', 'Local sync', 'Sync')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Local sync');
    backups.set([job('sync', 'Local sync', 'Sync')]);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Versioned backup');
  });
});
