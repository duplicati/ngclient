import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RemoteDestinationType } from '../../../../core/openapi';
import { TestDestinationResult, TestDestinationService } from '../../../../core/services/test-destination.service';
import { TestState, TestUrl } from './test-url';

const targetUrl = 'webdav://example.test/backups';
const suggestedUrl = `${targetUrl}?accept-specified-ssl-hash=certificate`;

function result(overrides: Partial<TestDestinationResult> = {}): TestDestinationResult {
  return { action: 'success', targetUrl, testAgain: false, destinationIndex: 0, ...overrides };
}

describe('TestUrl connection testing', () => {
  let fixture: ComponentFixture<TestUrl>;
  const requests: Subject<TestDestinationResult>[] = [];

  afterEach(() => {
    requests.splice(0).forEach((request) => request.complete());
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function setup(
    options: {
      targetUrl?: string | null;
      testSignal?: TestState;
      moduleType?: RemoteDestinationType;
      suppressErrorDialogs?: boolean;
      askToCreate?: boolean;
      readOnlyTest?: boolean;
    } = {}
  ) {
    const testDestination = vi.fn<TestDestinationService['testDestination']>(() => {
      const request = new Subject<TestDestinationResult>();
      requests.push(request);
      return request.asObservable();
    });
    TestBed.configureTestingModule({
      imports: [TestUrl],
      providers: [{ provide: TestDestinationService, useValue: { testDestination } }],
    });
    TestBed.overrideComponent(TestUrl, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(TestUrl);
    const inputs = {
      targetUrl,
      testSignal: null,
      backupId: 'backup-42',
      connectionStringId: 17,
      sourcePrefix: 'source-1',
      moduleType: 'SourceProvider',
      suppressErrorDialogs: false,
      askToCreate: true,
      readOnlyTest: true,
      testExpectation: 'any',
      ...options,
    };
    Object.entries(inputs).forEach(([name, value]) => fixture.componentRef.setInput(name, value));
    fixture.detectChanges();
    return { component: fixture.componentInstance, testDestination };
  }

  function respond(index: number, response: TestDestinationResult) {
    requests[index].next(response);
    requests[index].complete();
  }

  it.each(['Backend', 'SourceProvider', 'RestoreDestinationProvider'] as const)(
    'forwards the connection context for %s',
    async (moduleType) => {
      const { component, testDestination } = setup({ moduleType, suppressErrorDialogs: true, readOnlyTest: false });
      const pending = component.testDestination(false);
      expect(testDestination).toHaveBeenCalledExactlyOnceWith(
        targetUrl,
        'backup-42',
        17,
        'source-1',
        0,
        moduleType,
        true,
        'prompt',
        false
      );
      const response = result();
      respond(0, response);
      await expect(pending).resolves.toBe(response);
    }
  );

  it.each([
    { autoCreate: true, askToCreate: true, expected: 'create' },
    { autoCreate: true, askToCreate: false, expected: 'create' },
    { autoCreate: false, askToCreate: true, expected: 'prompt' },
    { autoCreate: false, askToCreate: false, expected: 'error' },
  ])(
    'uses $expected for autoCreate=$autoCreate and askToCreate=$askToCreate',
    async ({ autoCreate, askToCreate, expected }) => {
      const { component, testDestination } = setup({ askToCreate });
      const pending = component.testDestination(autoCreate);
      expect(testDestination).toHaveBeenCalledExactlyOnceWith(
        targetUrl,
        'backup-42',
        17,
        'source-1',
        0,
        'SourceProvider',
        false,
        expected,
        true
      );
      const response = result();
      respond(0, response);
      await expect(pending).resolves.toBe(response);
    }
  );

  it.each([null, ''])('does not test an empty URL (%s) or change its state', (url) => {
    const previous = result();
    const { component, testDestination } = setup({ targetUrl: url, testSignal: previous });
    expect(component.testDestination(false)).toBeUndefined();
    expect(component.testSignal()).toBe(previous);
    expect(testDestination).not.toHaveBeenCalled();
  });

  it.each(['success', 'generic-error'] as const)(
    'resolves a %s result only after the response arrives',
    async (action) => {
      const { component } = setup();
      expect(component.testResponse()).toBeNull();
      const pending = component.testDestination(false)!;
      const resolved = vi.fn();
      void pending.then(resolved);

      expect(component.testSignal()).toBe('testing');
      expect(component.testResponse()).toBeNull();
      await Promise.resolve();
      expect(resolved).not.toHaveBeenCalled();

      const response = result({ action });
      respond(0, response);
      await expect(pending).resolves.toBe(response);
      expect(resolved).toHaveBeenCalledExactlyOnceWith(response);
      expect(component.testSignal()).toBe(response);
      expect(component.testResponse()).toBe(response);
    }
  );

  it.each([suggestedUrl, undefined])('waits for a single retry using suggestion %s', async (suggestion) => {
    const { component, testDestination } = setup();
    const pending = component.testDestination(false)!;
    const resolved = vi.fn();
    void pending.then(resolved);
    respond(0, result({ action: 'test-again', testAgain: true, suggestedUrl: suggestion }));
    fixture.detectChanges();
    await Promise.resolve();

    expect(resolved).not.toHaveBeenCalled();
    expect(component.testSignal()).toBe('testing');
    expect(component.targetUrl()).toBe(suggestion ?? targetUrl);
    expect(testDestination).toHaveBeenCalledTimes(2);
    expect(testDestination).toHaveBeenNthCalledWith(
      2,
      suggestion ?? targetUrl,
      'backup-42',
      17,
      'source-1',
      0,
      'SourceProvider',
      false,
      'prompt',
      true
    );

    // The existing component supports only one retry, even if that result requests another.
    const response = result({ targetUrl: suggestion ?? targetUrl, action: 'test-again', testAgain: true });
    respond(1, response);
    await expect(pending).resolves.toBe(response);
    expect(resolved).toHaveBeenCalledExactlyOnceWith(response);
    expect(component.testSignal()).toBe(response);
    expect(testDestination).toHaveBeenCalledTimes(2);
  });

  it('returns a retry suggestion without automatically retrying when dialogs are suppressed', async () => {
    const { component, testDestination } = setup({ suppressErrorDialogs: true });
    const pending = component.testDestination(false);
    const response = result({ action: 'trust-cert', testAgain: true, suggestedUrl });
    respond(0, response);
    await expect(pending).resolves.toBe(response);
    expect(component.testSignal()).toBe(response);
    expect(component.targetUrl()).toBe(targetUrl);
    expect(testDestination).toHaveBeenCalledTimes(1);
  });

  it('applies a current suggestion and tests the suggested URL', () => {
    const { component, testDestination } = setup({ testSignal: result({ action: 'trust-cert', suggestedUrl }) });
    expect(component.useSuggestedUrl()).toBe(false);
    expect(component.targetUrl()).toBe(suggestedUrl);
    expect(component.testSignal()).toBe('testing');
    expect(testDestination).toHaveBeenCalledExactlyOnceWith(
      suggestedUrl,
      'backup-42',
      17,
      'source-1',
      0,
      'SourceProvider',
      false,
      'prompt',
      true
    );
    respond(0, result({ targetUrl: suggestedUrl }));
  });

  it.each([
    { name: 'missing suggestion', response: result({ action: 'trust-cert' }) },
    { name: 'stale result', response: result({ action: 'trust-cert', targetUrl: 'webdav://old.test', suggestedUrl }) },
  ])('ignores a $name', ({ response }) => {
    const { component, testDestination } = setup({ testSignal: response });
    expect(component.useSuggestedUrl()).toBe(false);
    expect(component.targetUrl()).toBe(targetUrl);
    expect(component.testSignal()).toBe(response);
    expect(testDestination).not.toHaveBeenCalled();
  });

  it('preserves an existing result on initial display', () => {
    const previous = result();
    const { component } = setup({ testSignal: previous });
    expect(component.testSignal()).toBe(previous);
  });

  it('clears the previous result when an idle URL changes', () => {
    const { component } = setup({ testSignal: result() });
    fixture.componentRef.setInput('targetUrl', 'webdav://other.test/backups');
    fixture.detectChanges();
    expect(component.testSignal()).toBeNull();
    expect(component.testResponse()).toBeNull();
  });

  it('preserves the result when the URL is unchanged', () => {
    const previous = result();
    const { component } = setup({ testSignal: previous });
    fixture.componentRef.setInput('targetUrl', targetUrl);
    fixture.detectChanges();
    expect(component.testSignal()).toBe(previous);
  });

  it('does not reset the testing state when the URL changes during a request', async () => {
    const { component } = setup();
    const pending = component.testDestination(false);
    fixture.componentRef.setInput('targetUrl', suggestedUrl);
    fixture.detectChanges();
    expect(component.testSignal()).toBe('testing');
    respond(0, result());
    await pending;
  });

  it.each([
    { method: 'createFolder', autoCreate: true },
    { method: 'testDestinationClick', autoCreate: false },
  ] as const)('delegates $method with autoCreate=$autoCreate', ({ method, autoCreate }) => {
    const { component } = setup();
    const test = vi.spyOn(component, 'testDestination').mockResolvedValue(result());
    expect(component[method]()).toBe(false);
    expect(test).toHaveBeenCalledExactlyOnceWith(autoCreate);
  });
});
