import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectingScreenService } from './connecting-screen.service';

describe('ConnectingScreenService', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  const setup = () => {
    const isolatedDocument = document.implementation.createHTMLDocument('Connecting screen test');
    const reload = vi.fn();
    vi.spyOn(isolatedDocument, 'defaultView', 'get').mockReturnValue({
      location: { reload },
    } as unknown as Document['defaultView']);
    TestBed.configureTestingModule({
      providers: [ConnectingScreenService, { provide: DOCUMENT, useValue: isolatedDocument }],
    });
    const loading = isolatedDocument.createElement('div');
    loading.className = 'loading';
    loading.textContent = 'Connecting ...';
    isolatedDocument.body.appendChild(loading);
    return { service: TestBed.inject(ConnectingScreenService), isolatedDocument, loading, reload };
  };

  it('replaces the initial loading content with an error and retry button', () => {
    const { service, loading } = setup();
    service.showError('Connection refused');
    expect(loading.classList.contains('has-error')).toBe(true);
    expect(loading.children.length).toBe(3);
    expect(loading.querySelector('.loading-title')?.textContent).toBe('Unable to connect');
    expect(loading.querySelector('.loading-error')?.textContent).toBe('Connection refused');
    expect(loading.querySelector('.retry-button')?.textContent).toBe('Retry');
    expect(loading.textContent).not.toContain('Connecting ...');
  });

  it('uses the fallback message for an empty error', () => {
    const { service, loading } = setup();
    service.showError('');
    expect(loading.querySelector('.loading-error')?.textContent).toBe('Unknown error');
  });

  it('renders HTML-like error messages as text rather than elements', () => {
    const { service, loading } = setup();
    const message = '<img src="missing" onerror="alert(1)"><strong>Connection failed</strong>';
    service.showError(message);
    expect(loading.querySelector('.loading-error')?.textContent).toBe(message);
    expect(loading.querySelector('img')).toBeNull();
    expect(loading.querySelector('strong')).toBeNull();
  });

  it('replaces an earlier error without duplicating content or retry actions', () => {
    const { service, loading, reload } = setup();
    service.showError('First failure');
    const oldButton = loading.querySelector('button');
    service.showError('Second failure');
    expect(loading.contains(oldButton)).toBe(false);
    expect(loading.querySelectorAll('.loading-title')).toHaveLength(1);
    expect(loading.querySelectorAll('.loading-error')).toHaveLength(1);
    expect(loading.querySelectorAll('button')).toHaveLength(1);
    expect(loading.querySelector('.loading-error')?.textContent).toBe('Second failure');
    expect(loading.textContent).not.toContain('First failure');
    expect(reload).not.toHaveBeenCalled();
    loading.querySelector<HTMLButtonElement>('button')!.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('reloads once only after clicking the non-submit retry button', () => {
    const { service, loading, reload } = setup();
    service.showError('Connection failed');
    const button = loading.querySelector<HTMLButtonElement>('button.retry-button')!;
    expect(button.type).toBe('button');
    expect(reload).not.toHaveBeenCalled();
    button.click();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the loading element is absent', () => {
    const { service, isolatedDocument, loading, reload } = setup();
    loading.remove();
    const other = isolatedDocument.createElement('main');
    other.textContent = 'Application';
    isolatedDocument.body.appendChild(other);
    const before = isolatedDocument.body.innerHTML;
    expect(() => service.showError('Connection failed')).not.toThrow();
    expect(isolatedDocument.body.innerHTML).toBe(before);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not replace a loading element nested inside another element', () => {
    const { service, isolatedDocument, loading, reload } = setup();
    const container = isolatedDocument.createElement('main');
    isolatedDocument.body.appendChild(container);
    container.appendChild(loading);
    const before = isolatedDocument.body.innerHTML;
    expect(() => service.showError('Connection failed')).not.toThrow();
    expect(isolatedDocument.body.innerHTML).toBe(before);
    expect(loading.classList.contains('has-error')).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
