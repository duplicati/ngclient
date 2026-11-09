import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import OptionsComponent, { createRestoreOptionsForm } from './options.component';

describe('Restore options for a cloud restore target', () => {
  afterEach(() => TestBed.resetTestingModule());

  function setup(type: 'o365' | 'gsuite', sourceUrl: string) {
    const optionsForm = createRestoreOptionsForm();
    // The hidden "handle existing" choice may be left at its file restore default
    optionsForm.patchValue({
      restoreFrom: 'same-custom',
      restoreFromPath: 'groups/group-1/',
      handleExisting: 'saveTimestamp',
    });
    const submit = vi.fn();
    const setAlternateRestorePath = vi.fn();
    TestBed.configureTestingModule({
      imports: [OptionsComponent],
      providers: [
        {
          provide: RestoreFlowState,
          useValue: {
            optionsForm,
            optionsFormSignal: signal(optionsForm.getRawValue()),
            isSubmitting: signal(false),
            extendedDataType: signal(type),
            advancedOptions: signal([]),
            canRegisterRestoredItems: signal(false),
            backup: signal({ Backup: { ID: '1', Sources: [`@/source|${sourceUrl}`] } }),
            selectFilesFormSignal: signal({ filesToRestore: '/source/groups/group-1/file' }),
            submit,
            setAlternateRestorePath,
          },
        },
        {
          provide: SysinfoState,
          useValue: { systemInfo: signal({ DirectorySeparator: '/' }), hasRestoreOptions: signal(true) },
        },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: { parent: {} } },
      ],
    }).overrideComponent(OptionsComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(OptionsComponent);
    fixture.detectChanges();
    return { component: fixture.componentInstance, optionsForm, submit, setAlternateRestorePath };
  }

  it.each([
    ['o365', 'office365://?office365-tenant-id=t', '@office365://'],
    ['gsuite', 'googleworkspace://?google-domain=d', '@googleworkspace://'],
  ] as const)('submits a %s restore with overwrite set', (type, sourceUrl, restorePrefix) => {
    const { component, optionsForm, submit, setAlternateRestorePath } = setup(type, sourceUrl);

    component.submit();

    expect(setAlternateRestorePath).toHaveBeenCalledTimes(1);
    expect(setAlternateRestorePath.mock.calls[0][0]).toMatch(new RegExp(`^${restorePrefix}`));
    expect(optionsForm.controls.handleExisting.value).toBe('overwrite');
    expect(submit).toHaveBeenCalledTimes(1);
  });
});
