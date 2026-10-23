import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import RestoreFromConfigComponent from './restore-from-config.component';

describe('Restore from exported configuration', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(OperationType?: string) {
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
    const fixture = TestBed.createComponent(RestoreFromConfigComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, backup, create, error, navigate };
  }
  it('rejects an exported Sync job before creating a temporary restore job', () => {
    const { component, create, error, navigate } = setup('Sync');
    component.submit();
    expect(create).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('Sync'));
    expect(component.isRestoring()).toBe(false);
  });
  it.each(['Backup', undefined])('continues to restore %s exported configurations', (OperationType) => {
    const { component, backup, create, error, navigate } = setup(OperationType);
    component.submit();
    expect(create).toHaveBeenCalledExactlyOnceWith({ body: { Backup: backup }, query: { temporary: true } });
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/restore-draft', 'temp-42']);
    expect(error).not.toHaveBeenCalled();
    expect(component.isRestoring()).toBe(false);
  });
});
