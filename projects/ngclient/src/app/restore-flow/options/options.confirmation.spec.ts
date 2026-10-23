import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import OptionsComponent, { createRestoreOptionsForm } from './options.component';

describe('Restore options cross-OS confirmation', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup(files: string, separator: string, mode: 'original' | 'pickLocation' = 'original') {
    const optionsForm = createRestoreOptionsForm();
    optionsForm.controls.restoreFrom.setValue(mode);
    const submit = vi.fn();
    const setAlternateRestorePath = vi.fn();
    const open = vi.fn();
    TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        {
          provide: RestoreFlowState,
          useValue: {
            optionsForm,
            optionsFormSignal: signal(optionsForm.getRawValue()),
            isSubmitting: signal(false),
            extendedDataType: signal(null),
            advancedOptions: signal([]),
            canRegisterRestoredItems: signal(false),
            backup: signal(null),
            selectFilesFormSignal: signal({ filesToRestore: files }),
            submit,
            setAlternateRestorePath,
          },
        },
        {
          provide: SysinfoState,
          useValue: { systemInfo: signal({ DirectorySeparator: separator }), hasRestoreOptions: signal(true) },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
      ],
    }).overrideComponent(OptionsComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(OptionsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, submit, open, setAlternateRestorePath };
  }
  it.each([
    ['/home/user/file.txt', '\\'],
    ['C:\\Users\\user\\file.txt', '/'],
    ['\\\\server\\share\\file.txt', '/'],
  ])('waits for confirmation before restoring %s to its original path on %s', (path, separator) => {
    const { component, submit, open } = setup(path, separator);
    component.submit();
    expect(submit).not.toHaveBeenCalled();
    expect(open).toHaveBeenCalledTimes(1);
    open.mock.calls[0][1].closed(true);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('does not restore when the cross-OS confirmation is cancelled', () => {
    const { component, submit, open } = setup('/home/user/file.txt', '\\');
    component.submit();
    open.mock.calls[0][1].closed(false);
    expect(submit).not.toHaveBeenCalled();
  });
  it.each([
    ['/home/user/file.txt', '/'],
    ['C:\\Users\\user\\file.txt', '\\'],
  ])('restores %s directly when the path separator matches %s', (path, separator) => {
    const { component, submit, open, setAlternateRestorePath } = setup(path, separator);
    component.submit();
    expect(open).not.toHaveBeenCalled();
    expect(setAlternateRestorePath).toHaveBeenCalledExactlyOnceWith(null, null);
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('does not warn about original locations when a destination folder is selected', () => {
    const { component, submit, open } = setup('/home/user/file.txt', '\\', 'pickLocation');
    component.submit();
    expect(open).not.toHaveBeenCalled();
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
