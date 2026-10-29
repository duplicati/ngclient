import { ComponentFixture, TestBed } from '@angular/core/testing';
import { finalize, of, Subject } from 'rxjs';
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
  const released: ReturnType<typeof vi.fn>[] = [];

  afterEach(() => {
    requests.splice(0).forEach((request) => request.complete());
    released.splice(0);
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
      const release = vi.fn();
      released.push(release);
      return request.pipe(finalize(release));
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

  it.each([false, true])('cancels a pending request on destroy (retry=%s)', async (retry) => {
    const { component, testDestination } = setup();
    const pending = component.testDestination(false)!;
    const settled = vi.fn();
    void pending.then(settled);
    if (retry) respond(0, result({ action: 'test-again', testAgain: true, suggestedUrl }));
    const index = retry ? 1 : 0;
    const state = component.testSignal();
    const url = component.targetUrl();

    fixture.destroy();
    await Promise.resolve();
    expect(released[index]).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledExactlyOnceWith(undefined);
    requests[index].next(result({ action: 'test-again', testAgain: true, suggestedUrl }));
    requests[index].error(new Error('late failure'));
    expect(component.testSignal()).toBe(state);
    expect(component.targetUrl()).toBe(url);
    expect(testDestination).toHaveBeenCalledTimes(retry ? 2 : 1);
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('does not start a request after destruction', () => {
    const { component, testDestination } = setup();
    fixture.destroy();
    expect(component.testDestination(false)).toBeUndefined();
    expect(testDestination).not.toHaveBeenCalled();
  });

  it('keeps a successful result when destroyed after completion', async () => {
    const { component } = setup();
    const pending = component.testDestination(false)!;
    const settled = vi.fn();
    void pending.then(settled);
    const response = result();
    respond(0, response);
    await pending;
    fixture.destroy();
    expect(settled).toHaveBeenCalledExactlyOnceWith(response);
    expect(component.testSignal()).toBe(response);
    expect(released[0]).toHaveBeenCalledTimes(1);
  });

  it('settles and releases every pending test on destruction', async () => {
    const { component } = setup();
    const first = component.testDestination(false)!;
    const second = component.testDestination(false)!;
    fixture.destroy();
    await expect(first).resolves.toBeUndefined();
    await expect(second).resolves.toBeUndefined();
    released.forEach((release) => expect(release).toHaveBeenCalledTimes(1));
  });

  it('releases synchronous initial and retry subscriptions without changing the result', async () => {
    const { component, testDestination } = setup();
    const initialReleased = vi.fn();
    const retryReleased = vi.fn();
    const response = result({ targetUrl: suggestedUrl });
    testDestination
      .mockReturnValueOnce(
        of(result({ action: 'test-again', testAgain: true, suggestedUrl })).pipe(finalize(initialReleased))
      )
      .mockReturnValueOnce(of(response).pipe(finalize(retryReleased)));
    await expect(component.testDestination(false)).resolves.toBe(response);
    fixture.destroy();
    expect(component.testSignal()).toBe(response);
    expect(initialReleased).toHaveBeenCalledTimes(1);
    expect(retryReleased).toHaveBeenCalledTimes(1);
  });

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

  it('keeps the testing state when the parent resets it on the retry URL change', () => {
    const { component } = setup();
    // Mirrors DestinationComponent.updateTargetUrl, which clears the test state on URL changes
    component.targetUrl.subscribe(() => component.testSignal.set(null));
    void component.testDestination(false);
    respond(0, result({ action: 'trust-cert', testAgain: true, suggestedUrl }));

    expect(component.targetUrl()).toBe(suggestedUrl);
    expect(component.testSignal()).toBe('testing');
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

  it('settles and clears a pending test when the URL changes', async () => {
    const { component } = setup();
    const pending = component.testDestination(false);
    fixture.componentRef.setInput('targetUrl', suggestedUrl);
    fixture.detectChanges();
    expect(component.testSignal()).toBeNull();
    await expect(pending).resolves.toBeUndefined();
    expect(released[0]).toHaveBeenCalledTimes(1);
    respond(0, result());
    expect(component.testSignal()).toBeNull();
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
  it('shares a running folder creation test with Continue and other test buttons', async () => {
    const { component, testDestination } = setup();
    const creating = component.testDestination(true)!;
    const continuing = component.testDestination(false)!;
    const repeated = component.testDestination(true)!;
    expect(continuing).toBe(creating);
    expect(repeated).toBe(creating);
    expect(testDestination).toHaveBeenCalledTimes(1);
    const response = result();
    respond(0, response);
    await expect(continuing).resolves.toBe(response);
    await expect(repeated).resolves.toBe(response);
  });

  it('does not share a running test that would not create the requested folder', async () => {
    const { component, testDestination } = setup({ askToCreate: false });
    const testing = component.testDestination(false)!;
    const creating = component.testDestination(true)!;
    expect(creating).not.toBe(testing);
    await expect(testing).resolves.toBeUndefined();
    expect(released[0]).toHaveBeenCalledTimes(1);
    expect(testDestination).toHaveBeenCalledTimes(2);
    expect(testDestination.mock.calls[1][7]).toBe('create');
    const response = result();
    respond(1, response);
    await expect(creating).resolves.toBe(response);
  });

  it.each(['error', 'empty'] as const)('settles all waiters and allows retry after %s', async (ending) => {
    const { component, testDestination } = setup();
    const first = component.testDestination(false)!;
    const second = component.testDestination(false)!;
    if (ending === 'error') requests[0].error(new Error('network failure'));
    else requests[0].complete();
    await Promise.all([first, second]);
    expect(component.testSignal()).not.toBe('testing');
    const retry = component.testDestination(false)!;
    expect(testDestination).toHaveBeenCalledTimes(2);
    respond(1, result());
    await expect(retry).resolves.toEqual(result());
  });

  it('does not reuse an old result when a new URL is tested before the URL effect runs', async () => {
    const { component, testDestination } = setup();
    const old = component.testDestination(false)!;
    fixture.componentRef.setInput('targetUrl', suggestedUrl);
    const current = component.testDestination(false)!;
    await expect(old).resolves.toBeUndefined();
    expect(testDestination).toHaveBeenCalledTimes(2);
    expect(released[0]).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    expect(component.testSignal()).toBe('testing');
    respond(1, result({ targetUrl: suggestedUrl }));
    await expect(current).resolves.toEqual(result({ targetUrl: suggestedUrl }));
  });
});
