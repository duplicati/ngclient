import { EMPTY, Observable, of, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AsyncOperation } from './async-operation';

describe('AsyncOperation', () => {
  it('settles synchronous success once and can run again', () => {
    const operation = new AsyncOperation<number>();
    const success = vi.fn();
    expect(operation.state()).toEqual({ status: 'idle' });
    operation.run(() => of(1, 2), success);
    expect(operation.state()).toEqual({ status: 'success' });
    expect(operation.pending()).toBe(false);
    expect(success.mock.calls).toEqual([[1]]);
    operation.run(() => of(3), success);
    expect(success.mock.calls).toEqual([[1], [3]]);
  });
  it('does not start another factory while pending', () => {
    const operation = new AsyncOperation<number>();
    const response = new Subject<number>();
    operation.run(() => response);
    const second = vi.fn(() => of(2));
    expect(operation.run(second)).toBe(false);
    expect(second).not.toHaveBeenCalled();
    expect(operation.pending()).toBe(true);
    operation.cancel();
  });
  it('unsubscribes cancelled work and ignores late results after a retry', () => {
    const operation = new AsyncOperation<number>();
    const old = new Subject<number>();
    const current = new Subject<number>();
    const success = vi.fn();
    operation.run(() => old, success);
    operation.cancel();
    expect(old.observed).toBe(false);
    expect(operation.state()).toEqual({ status: 'cancelled' });
    operation.run(() => current, success);
    old.next(1);
    expect(operation.pending()).toBe(true);
    expect(success).not.toHaveBeenCalled();
    current.next(2);
    expect(success.mock.calls).toEqual([[2]]);
  });
  it('catches a synchronous factory error and allows retry', () => {
    const operation = new AsyncOperation<number>();
    const error = new Error('failed');
    operation.run(() => {
      throw error;
    });
    expect(operation.state()).toEqual({ status: 'error', error });
    expect(operation.pending()).toBe(false);
    operation.run(() => of(1));
    expect(operation.state()).toEqual({ status: 'success' });
  });
  it('settles an observable error without calling success', () => {
    const operation = new AsyncOperation<number>();
    const response = new Subject<number>();
    const success = vi.fn();
    operation.run(() => response, success);
    const error = new Error('failed');
    response.error(error);
    expect(operation.state()).toEqual({ status: 'error', error });
    expect(success).not.toHaveBeenCalled();
  });
  it('treats empty completion as cancellation and runs teardown', () => {
    const operation = new AsyncOperation<number>();
    const teardown = vi.fn();
    operation.run(
      () =>
        new Observable((subscriber) => {
          subscriber.complete();
          return teardown;
        })
    );
    expect(operation.state()).toEqual({ status: 'cancelled' });
    expect(teardown).toHaveBeenCalledOnce();
    operation.run(() => EMPTY);
    expect(operation.pending()).toBe(false);
  });
  it('cancels on destruction and refuses further work', () => {
    const operation = new AsyncOperation<number>();
    const response = new Subject<number>();
    operation.run(() => response);
    operation.destroy();
    expect(response.observed).toBe(false);
    const factory = vi.fn(() => of(2));
    expect(operation.run(factory)).toBe(false);
    expect(factory).not.toHaveBeenCalled();
    expect(operation.state()).toEqual({ status: 'cancelled' });
  });
});
