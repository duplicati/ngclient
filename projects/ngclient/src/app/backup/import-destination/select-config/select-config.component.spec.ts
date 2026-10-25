import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../core/openapi';
import { BackupsState } from '../../../core/states/backups.state';
import { ImportDestinationState } from '../import-destination.state';
import SelectConfigComponent from './select-config.component';

describe('restore configurations from a destination', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(
    id: string | null = 'temp-42',
    available = [
      { BackupId: 'a', Name: 'Alpha' },
      { BackupId: 'b', Name: 'Beta' },
    ]
  ) {
    const responses: Subject<{ data: unknown }>[] = [];
    const importConfig = vi.fn(() => {
      const response = new Subject<{ data: unknown }>();
      responses.push(response);
      return response;
    });
    const list = vi.fn(() => of(available));
    const navigate = vi.fn();
    const success = vi.fn();
    const showErrorDialog = vi.fn();
    const addDraftBackup = vi.fn(() => 'draft-42');
    TestBed.configureTestingModule({
      imports: [SelectConfigComponent],
      providers: [
        { provide: ImportDestinationState, useValue: { temporaryBackupId: signal(id), showErrorDialog } },
        {
          provide: DuplicatiServer,
          useValue: { postApiV1BackupByIdRestoreTaskConfig: list, postApiV1BackupByIdImportfromtemp: importConfig },
        },
        { provide: BackupsState, useValue: { addDraftBackup } },
        { provide: Router, useValue: { navigate } },
        { provide: ShipAlertService, useValue: { success } },
      ],
    });
    TestBed.overrideComponent(SelectConfigComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(SelectConfigComponent);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      list,
      importConfig,
      responses,
      navigate,
      success,
      showErrorDialog,
      addDraftBackup,
    };
  }
  it('returns to destination selection without requesting configurations when the temporary job is missing', () => {
    const { list, navigate } = setup(null);
    expect(list).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup/import-destination/destination']);
  });
  it('selects a sole configuration automatically but imports nothing for an empty selection', () => {
    const sole = setup('temp-42', [{ BackupId: 'only', Name: 'Only' }]);
    expect(sole.list).toHaveBeenCalledExactlyOnceWith({ path: { id: 'temp-42' } });
    expect(sole.component.selectedItems().map((x) => x.BackupId)).toEqual(['only']);
    sole.component.selectNone();
    sole.component.import();
    expect(sole.importConfig).not.toHaveBeenCalled();
    expect(sole.component.isImporting()).toBe(false);
  });
  it('opens a single selection as an editable draft without reporting a direct import', () => {
    const { component, importConfig, responses, addDraftBackup, navigate, success } = setup();
    component.toggleSelected('b');
    component.importMetadata.set(true);
    component.import();
    expect(importConfig).toHaveBeenCalledExactlyOnceWith({
      body: { BackupId: 'b', ImportMetadata: true, Direct: false },
    });
    expect(component.isImporting()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    const data = { Backup: { Name: 'Beta' } };
    responses[0].next({ data });
    responses[0].complete();
    expect(addDraftBackup).toHaveBeenCalledExactlyOnceWith(data);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup-draft', 'draft-42']);
    expect(success).not.toHaveBeenCalled();
    expect(component.isImporting()).toBe(false);
  });
  it('imports multiple selections sequentially and forces direct mode', () => {
    const { component, importConfig, responses, navigate, success, addDraftBackup } = setup();
    component.selectAll();
    component.import();
    expect(importConfig).toHaveBeenCalledExactlyOnceWith({
      body: { BackupId: 'a', ImportMetadata: false, Direct: true },
    });
    expect(navigate).not.toHaveBeenCalled();
    responses[0].next({ data: null });
    responses[0].complete();
    expect(component.configs().map((x) => x.BackupId)).toEqual(['b']);
    expect(importConfig).toHaveBeenLastCalledWith({ body: { BackupId: 'b', ImportMetadata: false, Direct: true } });
    expect(success).not.toHaveBeenCalled();
    expect(component.isImporting()).toBe(true);
    responses[1].next({ data: null });
    responses[1].complete();
    expect(component.configs()).toEqual([]);
    expect(component.isImporting()).toBe(false);
    expect(addDraftBackup).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
  });
  it('honors save-now for one selection', () => {
    const { component, importConfig, responses, addDraftBackup, success } = setup();
    component.toggleSelected('a');
    component.saveNow.set(true);
    component.import();
    expect(importConfig).toHaveBeenCalledExactlyOnceWith({
      body: { BackupId: 'a', ImportMetadata: false, Direct: true },
    });
    responses[0].next({ data: null });
    responses[0].complete();
    expect(addDraftBackup).not.toHaveBeenCalled();
    expect(success).toHaveBeenCalledTimes(1);
  });
  it('stops on failure, retains the failed selection and retries only remaining configurations', () => {
    const { component, responses, importConfig, showErrorDialog, success, navigate } = setup();
    component.selectAll();
    component.import();
    responses[0].next({ data: null });
    responses[0].complete();
    responses[1].error(new Error('invalid config'));
    expect(component.isImporting()).toBe(false);
    expect(showErrorDialog).toHaveBeenCalledExactlyOnceWith('Failed to import Beta: invalid config');
    expect(component.configs().map((x) => x.BackupId)).toEqual(['b']);
    expect(success).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    component.import();
    expect(importConfig).toHaveBeenCalledTimes(3);
    expect(importConfig).toHaveBeenLastCalledWith({ body: { BackupId: 'b', ImportMetadata: false, Direct: false } });
    responses[2].next({ data: { Backup: { Name: 'Beta' } } });
    responses[2].complete();
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup-draft', 'draft-42']);
  });
});
