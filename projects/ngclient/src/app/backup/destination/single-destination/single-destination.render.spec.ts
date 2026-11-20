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
  async function setup(target = url) {
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
              { Key: 'duplicati', Options: [{ Name: 'duplicati-backup-id', Type: 'String' }] },
              {
                Key: 'ssh',
                Options: [
                  { Name: 'auth-password', Type: 'Password' },
                  { Name: 'ssh-key', Type: 'Password' },
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
    fixture.componentRef.setInput('targetUrl', target);
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

  it('offers console connection as a native link without rewriting the destination', async () => {
    const changed = await setup('duplicati://');
    expect(fixture.nativeElement.textContent).toContain('Connect');
    const link = fixture.nativeElement.querySelector('a[href="/connect/logon"]') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.textContent).toContain('Connect');
    let prevented: boolean | undefined;
    link.addEventListener('click', (event) => {
      prevented = event.defaultPrevented;
      event.preventDefault();
    });
    link.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
    expect(prevented).toBe(false);
    expect(fixture.componentInstance.targetUrl()).toBe('duplicati://');
    expect(changed).not.toHaveBeenCalled();
  });

  it('edits and reloads multiline destination text with blank lines and a trailing newline', async () => {
    const initial = url + '&ssh-key=initial';
    await setup(initial);
    const textarea = fixture.nativeElement.querySelector('app-file-drop-textarea textarea') as HTMLTextAreaElement;
    const text = 'first line\n\nsecond + & line\n';
    textarea.value = text;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const saved = fixture.componentInstance.targetUrl()!;
    expect(saved).toBe(initial.replace('ssh-key=initial', 'ssh-key=' + encodeURIComponent(text)));
    fixture.destroy();
    TestBed.resetTestingModule();
    const changed = await setup(saved);
    expect(fixture.nativeElement.querySelector('app-file-drop-textarea textarea').value).toBe(text);
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
