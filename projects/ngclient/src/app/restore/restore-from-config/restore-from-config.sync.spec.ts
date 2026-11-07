import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, SystemInfoDto } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import RestoreFromConfigComponent from './restore-from-config.component';

describe('Restore from exported configuration', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(OperationType: string | undefined, syncRestore: boolean) {
    const backup = { Name: 'Imported job', OperationType };
    const create = vi.fn(() => of({ ID: 'temp-42' }));
    const error = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [RestoreFromConfigComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: {
            postApiV1BackupsImport: vi.fn(() => of({ data: { Backup: backup } })),
            postApiV1Backups: create,
          },
        },
        { provide: ShipAlertService, useValue: { error } },
        { provide: Router, useValue: { navigate } },
      ],
    }).overrideComponent(RestoreFromConfigComponent, { set: { template: '', imports: [] } });
    TestBed.inject(SysinfoState).systemInfo.set({
      APIExtensions: syncRestore ? ['v1:backup:sync-restore'] : [],
    } as SystemInfoDto);
    const fixture = TestBed.createComponent(RestoreFromConfigComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, backup, create, error, navigate };
  }
  it.each(['Backup', 'Sync', undefined])('continues to restore %s exported configurations', (OperationType) => {
    const { component, backup, create, error, navigate } = setup(OperationType, true);
    component.submit();
    expect(create).toHaveBeenCalledExactlyOnceWith({ body: { Backup: backup }, query: { temporary: true } });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/restore-draft', 'temp-42']);
    expect(error).not.toHaveBeenCalled();
    expect(component.isRestoring()).toBe(false);
  });
  it('rejects an exported Sync job on a server that cannot restore it', () => {
    const { component, create, error, navigate } = setup('Sync', false);
    component.submit();
    expect(create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Sync'));
    expect(component.isRestoring()).toBe(false);
  });
  it.each(['Backup', undefined])(
    'restores %s exported configurations on a server without Sync restore',
    (OperationType) => {
      const { create, component } = setup(OperationType, false);
      component.submit();
      expect(create).toHaveBeenCalledTimes(1);
    }
  );
});
