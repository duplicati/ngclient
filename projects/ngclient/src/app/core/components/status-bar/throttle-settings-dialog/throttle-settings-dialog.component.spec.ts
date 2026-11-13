import { computed } from '@angular/core';
import { By } from '@angular/platform-browser';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../../openapi';
import ThrottleSettingsDialogComponent, { ThrottleUnitControl } from './throttle-settings-dialog.component';

describe('throttle settings requests and units', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(rendered = false) {
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
    if (!rendered) TestBed.overrideComponent(ThrottleSettingsDialogComponent, { set: { template: '', imports: [] } });
    const fixture = TestBed.createComponent(ThrottleSettingsDialogComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.closed.subscribe(closed);
    return { fixture, component, settings, response, get, patch, closed };
  }
  it('handles select-generated input events inside a computed context', () => {
    const { fixture, component } = setup(true);
    const input = fixture.nativeElement.querySelector('sh-select input') as HTMLInputElement;
    input.value = 'gbps';
    const control = fixture.debugElement.query(By.directive(ThrottleUnitControl)).injector.get(ThrottleUnitControl);
    const selectUpdate = computed(() => {
      control.updateValue();
      return true;
    });
    expect(selectUpdate()).toBe(true);
    fixture.detectChanges();
    expect(component.throttleForm.maxUploadUnit().value()).toBe('gbps');
  });
  it('renders loaded values and submits the edited numeric fields', () => {
    const { fixture, settings, patch } = setup(true);
    settings.next({ 'max-upload-speed': '1MB', 'max-download-speed': '1MB' });
    fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('input[type=number]') as NodeListOf<HTMLInputElement>;
    expect(inputs[0].value).toBe('8.39');
    expect(inputs[1].value).toBe('8.39');
    for (const input of inputs) {
      input.value = '8';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
    (fixture.nativeElement.querySelector('button.primary') as HTMLButtonElement).click();
    expect(patch).toHaveBeenCalledExactlyOnceWith({
      body: { 'max-upload-speed': '977KB', 'max-download-speed': '977KB' },
    });
  });

  it('maps cleared numeric inputs to unlimited settings', () => {
    const { fixture, component, patch } = setup(true);
    for (const input of fixture.nativeElement.querySelectorAll('input[type=number]') as NodeListOf<HTMLInputElement>) {
      input.value = '';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }
    expect(component.throttleForm.maxUpload().value()).toBeNull();
    expect(component.throttleForm.maxDownload().value()).toBeNull();
    component.submit();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ body: { 'max-upload-speed': '', 'max-download-speed': '' } });
  });
  it('converts binary byte rates from the API into decimal Mbps and Gbps', () => {
    const { component, settings, get } = setup();
    expect(get).toHaveBeenCalledTimes(1);
    settings.next({ 'max-upload-speed': '8MB', 'max-download-speed': '2gb' });
    expect(component.throttleForm.maxUpload().value()).toBe(67.11);
    expect(component.throttleForm.maxUploadUnit().value()).toBe('mbps');
    expect(component.throttleForm.maxDownload().value()).toBe(17.18);
    expect(component.throttleForm.maxDownloadUnit().value()).toBe('gbps');
  });
  it('uses unlimited defaults when limits are absent or empty', () => {
    const { component, settings } = setup();
    component.throttleForm.maxUpload().value.set(10);
    component.throttleForm.maxUploadUnit().value.set('gbps');
    settings.next({ 'max-download-speed': '' });
    expect(component.throttleForm.maxUpload().value()).toBe(0);
    expect(component.throttleForm.maxDownload().value()).toBe(0);
    expect(component.throttleForm.maxUploadUnit().value()).toBe('mbps');
    expect(component.throttleForm.maxDownloadUnit().value()).toBe('mbps');
  });
  it('resets a malformed limit without discarding the other valid direction', () => {
    const { component, settings } = setup();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    component.throttleForm.maxUpload().value.set(10);
    settings.next({ 'max-upload-speed': 'invalid', 'max-download-speed': '1MB' });
    expect(component.throttleForm.maxUpload().value()).toBe(0);
    expect(component.throttleForm.maxDownload().value()).toBe(8.39);
  });
  it('falls back to unlimited settings when loading fails', () => {
    const { component, settings } = setup();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    component.throttleForm.maxUpload().value.set(10);
    component.throttleForm.maxDownload().value.set(20);
    component.throttleForm.maxDownloadUnit().value.set('gbps');
    settings.error(new Error('settings unavailable'));
    expect(component.throttleForm.maxUpload().value()).toBe(0);
    expect(component.throttleForm.maxDownload().value()).toBe(0);
    expect(component.throttleForm.maxDownloadUnit().value()).toBe('mbps');
  });
  it('sends byte units for both directions and closes only after a successful response', () => {
    const { component, patch, response, closed } = setup();
    component.throttleForm.maxUpload().value.set(8.388608);
    component.throttleForm.maxUploadUnit().value.set('mbps');
    component.throttleForm.maxDownload().value.set(8.589934592);
    component.throttleForm.maxDownloadUnit().value.set('gbps');
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
    component.throttleForm.maxUpload().value.set(8.388608);
    component.submit();
    response.error(new Error('save failed'));
    expect(component.isSubmitting()).toBe(false);
    expect(component.throttleForm.maxUpload().value()).toBe(8.388608);
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
