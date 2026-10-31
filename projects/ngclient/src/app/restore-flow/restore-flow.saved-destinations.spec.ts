import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../core/openapi';
import { SysinfoState } from '../core/states/sysinfo.state';
import { ServerSettingsService } from '../settings/server-settings.service';
import { RestoreFlowState } from './restore-flow.state';

describe('direct restore saved destination selection', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        RestoreFlowState,
        { provide: Router, useValue: { navigate: vi.fn() } },
        { provide: ActivatedRoute, useValue: {} },
        { provide: SysinfoState, useValue: {} },
        { provide: ShipDialogService, useValue: { open: vi.fn() } },
        { provide: DuplicatiServer, useValue: {} },
        { provide: ServerSettingsService, useValue: { serverSettings: signal(undefined) } },
      ],
    });
    return TestBed.inject(RestoreFlowState);
  }
  const url = 'ssh://user@host/archive?auth-password=********&custom=a%26b';
  it('keeps the selected ID and the exact masked URL without rewriting either', () => {
    const state = setup();
    expect(state.destinationConnectionStringId()).toBeNull();
    state.updateTargetUrl(url, 7);
    expect(state.destinationTargetUrl()).toBe(url);
    expect(state.destinationConnectionStringId()).toBe(7);
    state.encryptionForm.patchValue({ passphrase: 'backup key' });
    expect(state.destinationConnectionStringId()).toBe(7);
  });
  it('invalidates the previous result even when a different connection has the same URL', () => {
    const state = setup();
    state.updateTargetUrl(url, 7);
    state.destinationTestSignal.set({ action: 'success', targetUrl: url, testAgain: false, destinationIndex: 0 });
    state.updateTargetUrl(url, 8);
    expect(state.destinationConnectionStringId()).toBe(8);
    expect(state.destinationTargetUrl()).toBe(url);
    expect(state.destinationTestSignal()).toBeNull();
  });
  it('clears the saved reference when entering a manual destination', () => {
    const state = setup();
    state.updateTargetUrl(url, 7);
    state.destinationTestSignal.set('testing');
    state.updateTargetUrl('file:///manual');
    expect(state.destinationConnectionStringId()).toBeNull();
    expect(state.destinationTestSignal()).toBeNull();
    expect(state.destinationTargetUrl()).toBe('file:///manual');
  });
  it('clears the reference when the URL is removed', () => {
    const state = setup();
    state.updateTargetUrl(url, 7);
    state.updateTargetUrl(null, 7);
    expect(state.destinationConnectionStringId()).toBeNull();
    expect(state.destinationTargetUrl()).toBeNull();
  });
});
