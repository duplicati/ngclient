import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, withComponentInputBinding } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackupsState } from '../../core/states/backups.state';
import LogComponent from './log.component';

const job = (id: string, operation: 'Backup' | 'Sync' = 'Backup', name = `Job ${id}`) => ({
  Backup: { ID: id, Name: name, OperationType: operation },
  Schedule: null,
});

describe('LogComponent route identity', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup(path = '/backup/42/log') {
    const jobs = signal([job('42'), job('43', 'Sync')]);
    const lookup = vi.fn((id: string) => jobs().find((item) => item.Backup.ID === id) ?? null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          [
            {
              path: 'backup/:id/log',
              component: LogComponent,
              canActivate: [(route) => route.params['id'] !== 'blocked'],
            },
          ],
          withComponentInputBinding()
        ),
        { provide: BackupsState, useValue: { getBackupById: lookup } },
      ],
    });
    // Exercise the real parent computation/router without child API calls.
    TestBed.overrideComponent(LogComponent, {
      set: {
        imports: [],
        template: '<p>{{ backup()?.Backup?.Name }}</p>',
      },
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, LogComponent);
    return { jobs, lookup, harness, component };
  }

  it('selects the initial job using the path ID', async () => {
    const { component, lookup, harness } = await setup();
    expect(component.backupId()).toBe('42');
    expect(component.backup()?.Backup.Name).toBe('Job 42');
    expect(component.isSync()).toBe(false);
    expect(component.activeTab()).toBe('general');
    expect(lookup).toHaveBeenCalledExactlyOnceWith('42');
    expect(harness.routeNativeElement?.textContent).toContain('Job 42');
  });

  it('reuses the component for different jobs while retaining the selected tab', async () => {
    const { harness, component } = await setup();
    component.activeTab.set('destination');
    expect(await harness.navigateByUrl('/backup/43/log', LogComponent)).toBe(component);
    expect(component.backupId()).toBe('43');
    expect(component.backup()?.Backup.Name).toBe('Job 43');
    expect(component.isSync()).toBe(true);
    expect(component.activeTab()).toBe('destination');
    await harness.navigateByUrl('/backup/42/log', LogComponent);
    expect(component.isSync()).toBe(false);
    expect(component.activeTab()).toBe('destination');
  });

  it('ignores a conflicting query ID and fragment without repeating the lookup', async () => {
    const { harness, component, lookup } = await setup();
    await harness.navigateByUrl('/backup/42/log?id=43#details', LogComponent);
    expect(component.backupId()).toBe('42');
    expect(component.backup()?.Backup.Name).toBe('Job 42');
    expect(lookup).toHaveBeenCalledExactlyOnceWith('42');
  });

  it('keeps a missing job null rather than retaining the previous job', async () => {
    const { harness, component } = await setup();
    await harness.navigateByUrl('/backup/missing/log', LogComponent);
    expect(component.backupId()).toBe('missing');
    expect(component.backup()).toBeNull();
    expect(component.isSync()).toBe(false);
    expect(harness.routeNativeElement?.textContent?.trim()).toBe('');
  });

  it('continues reacting to backup metadata updates without changing the route', async () => {
    const { jobs, component, harness } = await setup();
    jobs.set([job('42', 'Sync', 'Updated sync')]);
    harness.detectChanges();
    expect(component.backup()?.Backup.Name).toBe('Updated sync');
    expect(component.isSync()).toBe(true);
    expect(harness.routeNativeElement?.textContent).toContain('Updated sync');
  });

  it('preserves the previous ID when a guard rejects navigation', async () => {
    const { harness, component, lookup } = await setup();
    await harness.navigateByUrl('/backup/blocked/log');
    expect(TestBed.inject(Router).url).toBe('/backup/42/log');
    expect(component.backupId()).toBe('42');
    expect(component.backup()?.Backup.Name).toBe('Job 42');
    expect(lookup).toHaveBeenCalledExactlyOnceWith('42');
  });
});
