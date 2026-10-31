import { DatePipe } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { ShipAlertService } from '@ship-ui/core/ship-alert';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, RestoreTaskConfigElementDto } from '../../../core/openapi';
import { DayJsProvider } from '../../../core/providers/dayjs';
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

describe('configuration list loading', () => {
  afterEach(() => TestBed.resetTestingModule());

  function configuration(BackupId: string, Name: string): RestoreTaskConfigElementDto {
    return {
      BackupId,
      Name,
      OperationType: 'Backup',
      TargetURLDisplay: 'file:///archive',
      Metadata: {},
      DisplayNames: {},
      AdditionalTargetUrls: [],
    };
  }

  function render() {
    const response = new Subject<RestoreTaskConfigElementDto[]>();
    const list = vi.fn(() => response);
    const showErrorDialog = vi.fn();
    const navigate = vi.fn();
    TestBed.configureTestingModule({
      imports: [SelectConfigComponent],
      providers: [
        DatePipe,
        DayJsProvider,
        { provide: ImportDestinationState, useValue: { temporaryBackupId: signal('temp-42'), showErrorDialog } },
        { provide: DuplicatiServer, useValue: { postApiV1BackupByIdRestoreTaskConfig: list } },
        { provide: BackupsState, useValue: {} },
        { provide: Router, useValue: { navigate } },
        { provide: ShipAlertService, useValue: { success: vi.fn() } },
      ],
    });
    const fixture = TestBed.createComponent(SelectConfigComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, component: fixture.componentInstance, response, list, showErrorDialog, navigate };
  }

  it('distinguishes a failed request from an empty destination and offers retry', () => {
    const { fixture, element, response, showErrorDialog } = render();
    response.error(new Error('Server unavailable'));
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')!.textContent).toContain('Could not fetch backup configurations');
    expect(element.textContent).not.toContain('No backup configurations found');
    expect(
      Array.from(element.querySelectorAll('button')).some((button) => button.textContent?.trim() === 'Retry')
    ).toBe(true);
    expect(showErrorDialog).not.toHaveBeenCalled();
  });

  it('retries in place and shows empty only after a successful empty result', () => {
    const { fixture, element, response, list } = render();
    response.error(new Error('Offline'));
    fixture.detectChanges();
    const retryResponse = new Subject<RestoreTaskConfigElementDto[]>();
    list.mockReturnValue(retryResponse);
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Retry')!
      .click();
    fixture.detectChanges();
    expect(list).toHaveBeenCalledTimes(2);
    expect(element.querySelector('[role=alert]')).toBeNull();
    expect(element.querySelector('[role=status]')!.textContent).toContain('Fetching');
    retryResponse.next([]);
    fixture.detectChanges();
    expect(element.textContent).toContain('No backup configurations found');
    expect(element.querySelector('[role=alert]')).toBeNull();
  });

  it('allows a second retry after another failure and preserves sole-selection behavior', () => {
    const { fixture, element, response, list, component } = render();
    response.error(new Error('Offline'));
    const retry = () => {
      fixture.detectChanges();
      Array.from(element.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Retry')!
        .click();
    };
    const second = new Subject<RestoreTaskConfigElementDto[]>();
    list.mockReturnValue(second);
    retry();
    second.error(new Error('Still offline'));
    const third = new Subject<RestoreTaskConfigElementDto[]>();
    list.mockReturnValue(third);
    retry();
    third.next([configuration('a', 'Alpha')]);
    fixture.detectChanges();
    expect(component.selectedItems().map((item) => item.BackupId)).toEqual(['a']);
    expect(list).toHaveBeenCalledTimes(3);
    expect(element.querySelector('[role=alert]')).toBeNull();
  });

  it('does not start another list request while the current one is pending', () => {
    const { component, list } = render();
    component.ngOnInit();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it.each(['back', 'destroy'] as const)('ignores a late list result after %s', (action) => {
    const { component, fixture, response, navigate } = render();
    if (action === 'back') component.back();
    else fixture.destroy();
    expect(response.observed).toBe(false);
    response.next([configuration('late', 'Late')]);
    expect(component.configs()).toEqual([]);
    if (action === 'back') expect(navigate).toHaveBeenCalledExactlyOnceWith(['/backup/import-destination/encryption']);
    else expect(navigate).not.toHaveBeenCalled();
  });

  it('shows a retryable error when the request factory throws synchronously', () => {
    const { component, fixture, element, response, list } = render();
    response.complete();
    list.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    expect(() => component.ngOnInit()).not.toThrow();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')).not.toBeNull();
    expect(component.isLoading()).toBe(false);
  });

  it('keeps the existing alphabetical ordering and multi-selection defaults', () => {
    const { component, response } = render();
    response.next([configuration('b', 'Beta'), configuration('a', 'Alpha')]);
    expect(component.configs().map((item) => item.BackupId)).toEqual(['a', 'b']);
    expect(component.selectedItems()).toEqual([]);
  });
});
