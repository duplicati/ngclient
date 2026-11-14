import { Component, CUSTOM_ELEMENTS_SCHEMA, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideRouter, Router, RouterLink, RouterOutlet } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import OptionsComponent, { createRestoreOptionsForm } from './options.component';

@Component({ imports: [RouterOutlet], template: '<router-outlet />' })
class Shell {}
@Component({ template: '<p>Select files</p>' })
class FilesStub {}

describe('Restore options back navigation', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  async function setup(prefix = '/restore/42') {
    const optionsForm = createRestoreOptionsForm();
    const submit = vi.spyOn(OptionsComponent.prototype, 'submit').mockImplementation(() => {});
    const allowBack = signal(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter(
          ['restore/:id', 'restore-draft/:id', 'restore-from-files'].map((path) => ({
            path,
            component: Shell,
            children: [
              { path: 'options', component: OptionsComponent },
              { path: 'select-files', component: FilesStub, canActivate: [() => allowBack()] },
            ],
          }))
        ),
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
          },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            hasRestoreOptions: signal(false),
            restoreDestinationProviderModules: signal([]),
          },
        },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
      ],
    });
    TestBed.overrideComponent(OptionsComponent, {
      set: {
        imports: [ReactiveFormsModule, RouterLink, ShipButton, ShipIcon],
        // Keep the actual template and native form controls; isolate unrelated custom child controls.
        schemas: [CUSTOM_ELEMENTS_SCHEMA],
      },
    });
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(prefix + '/options');
    const back = () => harness.routeNativeElement!.querySelector<HTMLElement>('.form-actions > :first-child')!;
    return { harness, back, submit, allowBack, optionsForm };
  }
  it.each(['/restore/42', '/restore-draft/draft-42', '/restore-from-files'])(
    'links to the same file selection under %s',
    async (prefix) => {
      const { harness, back, submit } = await setup(prefix);
      expect(back().tagName).toBe('A');
      expect(back().getAttribute('href')).toBe(prefix + '/select-files');
      back().click();
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe(prefix + '/select-files');
      expect(submit).not.toHaveBeenCalled();
    }
  );
  it('leaves navigation and form edits intact when the guard rejects going back', async () => {
    const { harness, back, allowBack, optionsForm, submit } = await setup();
    optionsForm.controls.restoreFromPath.setValue('/keep edits');
    allowBack.set(false);
    back().click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/restore/42/options');
    expect(optionsForm.controls.restoreFromPath.value).toBe('/keep edits');
    expect(submit).not.toHaveBeenCalled();
  });
  it('keeps Submit as a separate form action', async () => {
    const { harness, submit } = await setup();
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await harness.fixture.whenStable();
    expect(submit).toHaveBeenCalledOnce();
    expect(TestBed.inject(Router).url).toBe('/restore/42/options');
  });
});
