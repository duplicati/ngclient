import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebModulesService } from '../../../core/services/webmodules.service';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { RemoteControlState } from '../../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { BackupState } from '../../backup.state';
import { SingleDestinationComponent } from './single-destination.component';

describe('SingleDestinationComponent rendered editing', () => {
  let fixture: ComponentFixture<SingleDestinationComponent>;
  const url =
    'ssh://Example.COM/archive%2fpart?auth-password=********&buffer-size=64MB&web-timeout=2m&future=a+b&future=two';
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  async function settle() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function setup() {
    TestBed.configureTestingModule({
      imports: [SingleDestinationComponent],
      providers: [
        provideRouter([]),
        { provide: ShipDialogService, useValue: {} },
        { provide: BackupState, useValue: {} },
        { provide: SysinfoState, useValue: { hasV2ListBackendOperations: signal(false) } },
        { provide: ServerSettingsService, useValue: { serverSettings: signal({}) } },
        {
          provide: DestinationConfigState,
          useValue: {
            allModules: signal([
              {
                Key: 'ssh',
                Options: [
                  { Name: 'auth-password', Type: 'Password' },
                  { Name: 'buffer-size', Type: 'Size' },
                  { Name: 'web-timeout', Type: 'Timespan' },
                ],
              },
            ]),
          },
        },
        { provide: RemoteControlState, useValue: { state: signal('disconnected') } },
        { provide: WebModulesService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(SingleDestinationComponent);
    fixture.componentRef.setInput('targetUrl', url);
    const changed = vi.fn();
    fixture.componentInstance.targetUrl.subscribe(changed);
    await settle();
    return changed;
  }

  it('keeps the URL unchanged after size and timespan controls initialize', async () => {
    const changed = await setup();
    expect(fixture.nativeElement.querySelector('app-size input[type=number]').value).toBe('64');
    expect(fixture.nativeElement.querySelector('app-timespan input[type=number]').value).toBe('2');
    expect(fixture.componentInstance.targetUrl()).toBe(url);
    expect(changed).not.toHaveBeenCalled();
  });

  it('updates a size from a real input event without touching other URL tokens', async () => {
    await setup();
    const number = fixture.nativeElement.querySelector('app-size input[type=number]');
    number.value = '128';
    number.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    expect(fixture.componentInstance.targetUrl()).toBe(url.replace('buffer-size=64MB', 'buffer-size=128MB'));
  });
});
