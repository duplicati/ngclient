import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { NEVER, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import StatusBarComponent from '../../core/components/status-bar/status-bar.component';
import { StatusBarState } from '../../core/components/status-bar/status-bar.state';
import { Commandline, DuplicatiServer } from '../../core/openapi';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import CommandlineComponent from './commandline.component';
import { CommandlineService } from './commandline.service';

@Component({ selector: 'app-status-bar', template: '' })
class StatusBarStub {}
@Component({ template: '<p>Home</p>' })
class HomeStub {}

describe('command editor home navigation', () => {
  afterEach(() => TestBed.resetTestingModule());

  async function setup() {
    const run = vi.fn();
    const saveState = vi.fn();
    const state = { optionsForm: {}, finishedLoading: signal(false), backupId: signal('42'), settings: signal([]) };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'backup/:id/commandline', component: CommandlineComponent },
          { path: '', component: HomeStub },
        ]),
        { provide: DuplicatiServer, useValue: { getApiV1BackupById: () => NEVER, postApiV1Commandline: run } },
        { provide: Commandline, useValue: { getApiV1Commandline: () => of(['backup']) } },
        { provide: StatusBarState, useValue: {} },
        { provide: CommandlineService, useValue: { saveState } },
        { provide: SysinfoState, useValue: { systemInfo: signal({ OSType: 'Linux' }) } },
      ],
    }).overrideComponent(CommandlineComponent, {
      remove: { imports: [StatusBarComponent], providers: [BackupState] },
      add: { imports: [StatusBarStub], providers: [{ provide: BackupState, useValue: state }] },
    });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl('/backup/42/commandline', CommandlineComponent);
    const link = harness.routeNativeElement!.querySelector('.back a') as HTMLAnchorElement;
    return { harness, component, link, run, saveState };
  }

  it('offers a native home link while loading without running or saving a command', async () => {
    const { harness, link, run, saveState } = await setup();
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe('/');
    link.click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/');
    expect(run).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });

  it('allows browser modified-click navigation without changing the editor', async () => {
    const { component, link, run, saveState } = await setup();
    expect(link).not.toBeNull();
    component.baseCmdForm.controls.arguments.setValue('keep these arguments');
    let prevented: boolean | undefined;
    link.addEventListener('click', (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault(); // Suppress jsdom document navigation after observing RouterLink.
    });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(prevented).toBe(false);
    expect(TestBed.inject(Router).url).toBe('/backup/42/commandline');
    expect(component.baseCmdForm.controls.arguments.value).toBe('keep these arguments');
    expect(run).not.toHaveBeenCalled();
    expect(saveState).not.toHaveBeenCalled();
  });
});
