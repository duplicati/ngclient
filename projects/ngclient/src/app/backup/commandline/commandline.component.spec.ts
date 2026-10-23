import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { Commandline, DuplicatiServer, SettingInputDto } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import CommandlineComponent from './commandline.component';
import { CommandlineService, CommandlineState } from './commandline.service';

describe('command execution confirmation and arguments', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(saved?: CommandlineState) {
    const response = new Subject<{ Status: string; ID: string }>();
    const run = vi.fn(() => response);
    const navigate = vi.fn();
    const saveState = vi.fn(() => 'editor-state');
    const getState = vi.fn(() => saved);
    const confirm = vi.fn((_continuation: () => void) => {});
    const settings = signal<SettingInputDto[]>([]);
    const mapFormsToSettings = vi.fn(() => [
      { Name: 'retry-count', Value: '7' },
      { Name: '--verbose', Value: 'true' },
    ]);
    const state = {
      optionsFields: {},
      finishedLoading: signal(false),
      backupId: signal('42'),
      settings,
      mapFormsToSettings,
      mapScheduleToForm: vi.fn(),
      mapGeneralToForm: vi.fn(),
      mapOptionsToForms: vi.fn(),
    };
    const route = { params: of({ id: '42' }), snapshot: { queryParams: saved ? { state: 'previous-state' } : {} } };
    const backup = {
      ID: '42',
      Name: 'Documents',
      DBPath: '/db/local.sqlite',
      TargetURL: 'file:///backup',
      Sources: ['/source'],
      Filters: [],
      Settings: [],
    };
    TestBed.configureTestingModule({
      imports: [CommandlineComponent],
      providers: [
        { provide: BackupState, useValue: state },
        {
          provide: DuplicatiServer,
          useValue: { getApiV1BackupById: () => of({ Backup: backup }), postApiV1Commandline: run },
        },
        { provide: Router, useValue: { navigate } },
        { provide: ActivatedRoute, useValue: route },
        { provide: Commandline, useValue: { getApiV1Commandline: () => of([]) } },
        { provide: StatusBarState, useValue: { resumeDialogCheck: confirm } },
        { provide: CommandlineService, useValue: { saveState, getState } },
        { provide: SysinfoState, useValue: { systemInfo: signal({ OSType: 'Linux' }) } },
      ],
    });
    TestBed.overrideComponent(CommandlineComponent, { set: { template: '', imports: [], providers: [] } });
    const fixture = TestBed.createComponent(CommandlineComponent);
    fixture.detectChanges();
    return {
      component: fixture.componentInstance,
      response,
      run,
      navigate,
      saveState,
      getState,
      confirm,
      state,
      route,
    };
  }
  it('does not execute or save editor state before the resume confirmation accepts', () => {
    const { component, run, confirm, saveState } = setup();
    component.submit();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(false);
  });
  it('sends separate arguments and filters, and preserves spaces without shell quoting', () => {
    const { component, confirm, run, state } = setup();
    component.baseCmdForm.patchValue({
      command: 'test',
      arguments: ['/source path', '', '/second'].join(String.fromCharCode(10)),
    });
    component.updateFilters(['*.txt', '-cache/*', '']);
    component.submit();
    confirm.mock.calls[0][0]();
    expect(state.mapFormsToSettings).toHaveBeenCalledExactlyOnceWith(['backup-id', 'backup-name', 'dbpath']);
    expect(run).toHaveBeenCalledExactlyOnceWith({
      body: [
        'test',
        'file:///backup',
        '/source path',
        '/second',
        '--backup-name=Documents',
        '--dbpath=/db/local.sqlite',
        '--backup-id=42',
        '--include=*.txt',
        '--exclude=cache/*',
        '--retry-count=7',
        '--verbose=true',
        '--disable-module=console-password-input',
      ],
    });
    expect(component.isSubmitting()).toBe(true);
  });
  it('keeps editor state in the URL and navigates to output only after an OK response', () => {
    const { component, confirm, response, navigate, saveState, route } = setup();
    component.submit();
    confirm.mock.calls[0][0]();
    expect(saveState).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'backup',
        targetUrl: 'file:///backup',
        backupId: '42',
        backupName: 'Documents',
      })
    );
    expect(navigate).toHaveBeenCalledExactlyOnceWith([], {
      relativeTo: route,
      queryParams: { state: 'editor-state' },
      replaceUrl: true,
    });
    response.next({ Status: 'OK', ID: 'task-7' });
    response.complete();
    expect(navigate).toHaveBeenLastCalledWith(['backup', '42', 'commandline', 'task-7'], {
      queryParams: { state: 'editor-state' },
    });
  });
  it('clears pending state after API failure without navigating to task output', () => {
    const { component, confirm, response, navigate } = setup();
    component.submit();
    confirm.mock.calls[0][0]();
    response.error(new Error('server unavailable'));
    expect(component.isSubmitting()).toBe(false);
    expect(navigate).toHaveBeenCalledTimes(1);
  });
  it('restores a previous editor state after loading backup defaults', () => {
    const saved: CommandlineState = {
      command: 'list',
      targetUrl: 'file:///other',
      arguments: 'pattern with spaces',
      backupId: '42',
      backupName: 'Saved name',
      dbpath: '/other/db',
      filters: ['-*.tmp'],
      options: [{ Name: '--retry-count', Value: '3' }],
    };
    const { component, state, getState } = setup(saved);
    expect(getState).toHaveBeenCalledExactlyOnceWith('previous-state');
    expect(component.baseCmdForm.value).toEqual({
      command: 'list',
      targetUrl: 'file:///other',
      arguments: 'pattern with spaces',
    });
    expect(component.standardFields.value).toEqual({
      'backup-id': '42',
      'backup-name': 'Saved name',
      dbpath: '/other/db',
      filters: ['-*.tmp'],
    });
    expect(component.filters()).toEqual(['-*.tmp']);
    expect(state.settings()).toEqual(saved.options);
    expect(state.finishedLoading()).toBe(true);
  });
});
