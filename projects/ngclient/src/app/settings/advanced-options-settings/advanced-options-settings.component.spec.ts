import { signal } from '@angular/core';
import { DeferBlockBehavior, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer, SettingDto } from '../../core/openapi';
import { ServerSettingsService } from '../server-settings.service';
import AdvancedOptionsSettingsComponent from './advanced-options-settings.component';

function option(Name: string, Value: string): SettingDto {
  return { Name, Value, Filter: '', Argument: {} };
}

describe('Advanced options settings save', async () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  async function render(
    initial: Record<string, string> | undefined = {
      '--retry-delay': '5s',
      '--removed': 'old',
      'server-setting': 'keep',
    }
  ) {
    const response = new Subject<unknown>();
    const patch = vi.fn((_request: { body: Record<string, string | null> }) => response);
    const refreshServerSettings = vi.fn();
    const serverSettings = signal<Record<string, string> | undefined>(initial);
    TestBed.configureTestingModule({
      imports: [AdvancedOptionsSettingsComponent],
      deferBlockBehavior: DeferBlockBehavior.Manual,
      providers: [
        { provide: ServerSettingsService, useValue: { serverSettings, refreshServerSettings } },
        { provide: DuplicatiServer, useValue: { patchApiV1Serversettings: patch } },
      ],
    });
    await TestBed.compileComponents();
    const fixture = TestBed.createComponent(AdvancedOptionsSettingsComponent);
    fixture.detectChanges();
    return {
      fixture,
      component: fixture.componentInstance,
      element: fixture.nativeElement as HTMLElement,
      response,
      patch,
      refreshServerSettings,
      serverSettings,
    };
  }

  it('submits once while pending, disables save and announces progress', async () => {
    const { fixture, component, element, patch } = await render();
    component.submit();
    component.submit();
    fixture.detectChanges();
    expect(patch).toHaveBeenCalledTimes(1);
    expect(element.querySelector<HTMLButtonElement>('button')!.disabled).toBe(true);
    expect(element.querySelector('.options-editor')!.getAttribute('aria-busy')).toBe('true');
    expect(element.querySelector('.options-editor')!.hasAttribute('inert')).toBe(true);
    expect(element.querySelector('[role=status]')!.textContent).toContain('Saving');
  });

  it('preserves option names, values, removal nulls and excludes ordinary server settings', async () => {
    const { component, patch } = await render();
    component.settings.set([option('retry-delay', '10s'), option('--custom-option', 'special & value')]);
    component.submit();
    expect(patch).toHaveBeenCalledExactlyOnceWith({
      body: {
        '--retry-delay': '10s',
        '--custom-option': 'special & value',
        '--removed': null,
      },
    });
  });

  it('shows errors, retains edits and retries current values without reporting success', async () => {
    const { fixture, component, element, response, patch, refreshServerSettings } = await render();
    component.settings.set([option('retry-delay', '10s')]);
    component.submit();
    response.error(new Error('Save rejected'));
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')!.textContent).toContain('Please try again');
    expect(component.settings()[0].Value).toBe('10s');
    expect(component.saved()).toBe(false);
    expect(component.isSubmitting()).toBe(false);
    expect(refreshServerSettings).not.toHaveBeenCalled();
    const retry = new Subject<unknown>();
    patch.mockReturnValue(retry);
    component.settings.set([option('retry-delay', '20s')]);
    component.submit();
    fixture.detectChanges();
    expect(element.querySelector('[role=alert]')).toBeNull();
    expect(patch.mock.calls[1][0].body['--retry-delay']).toBe('20s');
    retry.next({});
    expect(component.saved()).toBe(true);
    expect(refreshServerSettings).toHaveBeenCalledTimes(1);
  });

  it('ignores a response after the component is destroyed', async () => {
    const { fixture, component, response, refreshServerSettings } = await render();
    component.submit();
    fixture.destroy();
    expect(response.observed).toBe(false);
    response.next({});
    expect(component.saved()).toBe(false);
    expect(refreshServerSettings).not.toHaveBeenCalled();
  });

  it('does not save before server settings have loaded', async () => {
    const { fixture, patch, serverSettings } = await render();
    serverSettings.set(undefined);
    // Use a fresh component with the still-unavailable source.
    fixture.destroy();
    const pendingFixture = TestBed.createComponent(AdvancedOptionsSettingsComponent);
    pendingFixture.detectChanges();
    pendingFixture.componentInstance.submit();
    expect(patch).not.toHaveBeenCalled();
    expect(pendingFixture.nativeElement.querySelector('button').disabled).toBe(true);
  });

  it('finishes loading even when the server has no settings', async () => {
    const { component } = await render({});
    expect(component.isLoadingOptions()).toBe(false);
  });

  it('keeps the latest success notice for three seconds without an older timer hiding it', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { component, response, patch } = await render();
    component.submit();
    response.next({});
    expect(component.saved()).toBe(true);
    vi.advanceTimersByTime(2000);
    const second = new Subject<unknown>();
    patch.mockReturnValue(second);
    component.submit();
    expect(component.saved()).toBe(false);
    second.next({});
    vi.advanceTimersByTime(1001);
    expect(component.saved()).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(component.saved()).toBe(false);
  });

  it('does not run the success timer after destruction', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const { component, fixture, response } = await render();
    component.submit();
    response.next({});
    fixture.destroy();
    vi.advanceTimersByTime(3000);
    expect(component.saved()).toBe(true);
  });

  it('catches a synchronous request failure and unlocks the editor', async () => {
    const { component, fixture, element, patch } = await render();
    patch.mockImplementation(() => {
      throw new Error('Unavailable');
    });
    expect(() => component.submit()).not.toThrow();
    fixture.detectChanges();
    expect(component.isSubmitting()).toBe(false);
    expect(element.querySelector('[role=alert]')).not.toBeNull();
  });
});
