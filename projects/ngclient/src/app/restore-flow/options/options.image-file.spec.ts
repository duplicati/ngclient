import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import OptionsComponent, { createRestoreOptionsForm } from './options.component';

describe('Restore options for an image file target', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(modules: { Key: string }[]) {
    const optionsForm = createRestoreOptionsForm();
    const optionsFormSignal = signal(optionsForm.getRawValue());
    optionsForm.valueChanges.subscribe(() => optionsFormSignal.set(optionsForm.getRawValue()));

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
            optionsFormSignal,
            isSubmitting: signal(false),
            extendedDataType: signal('diskimage'),
            advancedOptions: signal([]),
            canRegisterRestoredItems: signal(false),
            backup: signal({ Backup: { ID: '1', Sources: ['@/mnt/dupl-disk-abc|diskimage:///dev/sdb'] } }),
            selectFilesFormSignal: signal({ filesToRestore: '@/mnt/dupl-disk-abc|diskimage:///dev/sdb/' }),
            submit,
            setAlternateRestorePath,
          },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            hasRestoreOptions: signal(true),
            restoreDestinationProviderModules: signal(modules),
          },
        },
        { provide: ShipDialogService, useValue: { open } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
      ],
    }).overrideComponent(OptionsComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(OptionsComponent);
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, optionsForm, submit, open, setAlternateRestorePath };
  }

  it('is offered only when the server has the image file restore module', () => {
    expect(setup([{ Key: 'diskimage' }]).component.canRestoreToImageFile()).toBe(false);
    TestBed.resetTestingModule();
    expect(setup([{ Key: 'diskimage' }, { Key: 'diskimage-file' }]).component.canRestoreToImageFile()).toBe(true);
  });

  it('suggests a file name from the backed-up disk and follows the format', () => {
    const { component, optionsForm, fixture } = setup([{ Key: 'diskimage-file' }]);
    optionsForm.controls.restoreFrom.setValue('diskimage-file');
    component.chooseImageFileDestination();
    expect(optionsForm.controls.imageFileName.value).toBe('sdb.img');

    component.setImageFormat('vhdx');
    expect(optionsForm.controls.imageFileName.value).toBe('sdb.vhdx');

    optionsForm.controls.imageFileName.setValue('server.vhd');
    fixture.detectChanges();
    expect(optionsForm.controls.imageFormat.value).toBe('vhd');
  });

  it('restores to the image file in the chosen folder', () => {
    const { component, optionsForm, submit, open, setAlternateRestorePath } = setup([{ Key: 'diskimage-file' }]);
    optionsForm.patchValue({
      restoreFrom: 'diskimage-file',
      imageFolder: '/images',
      imageFileName: 'sdb.img',
      imageOverwrite: true,
      imagePreallocate: true,
    });

    component.submit();

    expect(open).not.toHaveBeenCalled();
    expect(setAlternateRestorePath).toHaveBeenCalledExactlyOnceWith(
      '@diskimage-file:///images/sdb.img?diskimage-restore-image-preallocate=true',
      null
    );
    expect(optionsForm.controls.handleExisting.value).toBe('overwrite');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('does not replace an existing image unless asked', () => {
    const { component, optionsForm, submit } = setup([{ Key: 'diskimage-file' }]);
    optionsForm.patchValue({ restoreFrom: 'diskimage-file', imageFolder: '/images', imageFileName: 'sdb.vhdx' });

    component.submit();

    expect(optionsForm.controls.handleExisting.value).toBe('saveTimestamp');
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('asks for a folder before restoring', () => {
    const { component, optionsForm, submit, open } = setup([{ Key: 'diskimage-file' }]);
    optionsForm.patchValue({ restoreFrom: 'diskimage-file', imageFileName: 'sdb.img' });

    component.submit();

    expect(open).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
