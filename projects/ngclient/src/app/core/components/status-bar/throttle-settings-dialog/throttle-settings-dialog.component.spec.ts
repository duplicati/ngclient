import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../openapi';
import ThrottleSettingsDialogComponent from './throttle-settings-dialog.component';

describe('throttle settings requests and units', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup() {
    const settings = new Subject<Record<string, string>>();
    const response = new Subject<unknown>();
    const get = vi.fn(() => settings);
    const patch = vi.fn(() => response);
    const closed = vi.fn();
    TestBed.configureTestingModule({
      imports: [ThrottleSettingsDialogComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { getApiV1Serversettings: get, patchApiV1Serversettings: patch } },
      ],
    });
    TestBed.overrideComponent(ThrottleSettingsDialogComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ThrottleSettingsDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.closed.subscribe(closed);
    return { component, settings, response, get, patch, closed };
  }
  it('converts binary byte rates from the API into decimal Mbps and Gbps', () => {
    const { component, settings, get } = setup();
    expect(get).toHaveBeenCalledTimes(1);
    settings.next({ 'max-upload-speed': '8MB', 'max-download-speed': '2gb' });
    expect(component.maxUpload()).toBe(67.11);
    expect(component.maxUploadUnit()).toBe('mbps');
    expect(component.maxDownload()).toBe(17.18);
    expect(component.maxDownloadUnit()).toBe('gbps');
  });
  it('uses unlimited defaults when limits are absent or empty', () => {
    const { component, settings } = setup();
    component.maxUpload.set(10);
    component.maxUploadUnit.set('gbps');
    settings.next({ 'max-download-speed': '' });
    expect(component.maxUpload()).toBe(0);
    expect(component.maxDownload()).toBe(0);
    expect(component.maxUploadUnit()).toBe('mbps');
    expect(component.maxDownloadUnit()).toBe('mbps');
  });
  it('resets a malformed limit without discarding the other valid direction', () => {
    const { component, settings } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    component.maxUpload.set(10);
    settings.next({ 'max-upload-speed': 'invalid', 'max-download-speed': '1MB' });
    expect(component.maxUpload()).toBe(0);
    expect(component.maxDownload()).toBe(8.39);
  });
  it('falls back to unlimited settings when loading fails', () => {
    const { component, settings } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.maxUpload.set(10);
    component.maxDownload.set(20);
    component.maxDownloadUnit.set('gbps');
    settings.error(new Error('settings unavailable'));
    expect(component.maxUpload()).toBe(0);
    expect(component.maxDownload()).toBe(0);
    expect(component.maxDownloadUnit()).toBe('mbps');
  });
  it('sends byte units for both directions and closes only after a successful response', () => {
    const { component, patch, response, closed } = setup();
    component.maxUpload.set(8.388608);
    component.maxUploadUnit.set('mbps');
    component.maxDownload.set(8.589934592);
    component.maxDownloadUnit.set('gbps');
    component.submit();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ body: { 'max-upload-speed': '1MB', 'max-download-speed': '1GB' } });
    expect(component.isSubmitting()).toBe(true);
    expect(closed).not.toHaveBeenCalled();
    response.next({});
    response.complete();
    expect(closed).toHaveBeenCalledExactlyOnceWith(true);
    expect(component.isSubmitting()).toBe(false);
  });
  it('sends empty limits when the user chooses unlimited transfers', () => {
    const { component, patch, response } = setup();
    component.submit();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ body: { 'max-upload-speed': '', 'max-download-speed': '' } });
    response.complete();
  });
  it('retains edits on a failed save, keeps the dialog open and permits retry', () => {
    const { component, patch, response, closed } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.maxUpload.set(8.388608);
    component.submit();
    response.error(new Error('save failed'));
    expect(component.isSubmitting()).toBe(false);
    expect(component.maxUpload()).toBe(8.388608);
    expect(closed).not.toHaveBeenCalled();
    const retry = new Subject<unknown>();
    patch.mockReturnValue(retry);
    component.submit();
    expect(patch).toHaveBeenCalledTimes(2);
    retry.next({});
    retry.complete();
    expect(closed).toHaveBeenCalledExactlyOnceWith(true);
  });
});
