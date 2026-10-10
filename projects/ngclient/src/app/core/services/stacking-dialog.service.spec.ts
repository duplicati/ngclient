import { ApplicationRef, Component, input, output, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StackingDialogService } from './stacking-dialog.service';

@Component({
  selector: 'app-parent-dialog',
  template: `
    <input [value]="entered()" (input)="entered.set($any($event.target).value)" />
  `,
})
class ParentDialog {
  data = input<{ initial: string }>();
  closed = output<string | null>();
  entered = signal('');
}

@Component({
  selector: 'app-child-dialog',
  template: `
    <button (click)="closed.emit('picked')">Pick</button>
  `,
})
class ChildDialog {
  closed = output<string>();
}

// jsdom does not implement the modal dialog API that sh-dialog relies on.
const dialogProto = HTMLDialogElement.prototype as HTMLDialogElement & { showModal?: () => void; close?: () => void };
const originalShowModal = dialogProto.showModal;
const originalClose = dialogProto.close;

function installDialogPolyfill() {
  dialogProto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dialogProto.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

function restoreDialogPolyfill() {
  dialogProto.showModal = originalShowModal;
  dialogProto.close = originalClose;
}

describe('StackingDialogService', () => {
  let service: StackingDialogService;
  let appRef: ApplicationRef;

  const hosts = () => Array.from(document.body.querySelectorAll('sh-dialog-ref'));
  const openDialogs = () => Array.from(document.body.querySelectorAll('dialog[open]'));
  const pressEscape = () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

  /** Runs change detection and drains the microtask queue used for dialog teardown. */
  async function settle() {
    appRef.tick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    appRef.tick();
  }

  beforeEach(() => {
    installDialogPolyfill();
    TestBed.configureTestingModule({
      providers: [{ provide: ShipDialogService, useClass: StackingDialogService }],
    });
    service = TestBed.inject(ShipDialogService) as unknown as StackingDialogService;
    appRef = TestBed.inject(ApplicationRef);
  });

  afterEach(async () => {
    service.ngOnDestroy();
    await settle();
    TestBed.resetTestingModule();
    restoreDialogPolyfill();
    expect(hosts()).toHaveLength(0);
  });

  it('is the implementation behind the ShipDialogService token', () => {
    expect(service).toBeInstanceOf(StackingDialogService);
  });

  it('keeps the parent dialog and its state while a child dialog is open', async () => {
    const parent = service.open(ParentDialog, { data: { initial: 'x' } });
    await settle();
    parent.component.entered.set('typed by the user');

    const child = service.open(ChildDialog, {});
    await settle();

    expect(service.openCount).toBe(2);
    expect(hosts()).toHaveLength(2);
    expect(openDialogs()).toHaveLength(2);
    expect(document.body.querySelector('app-parent-dialog')).not.toBeNull();
    expect(document.body.querySelector('app-child-dialog')).not.toBeNull();

    const childResult = vi.fn();
    child.closed.subscribe(childResult);
    child.component.closed.emit('picked');
    await settle();

    expect(childResult).toHaveBeenCalledExactlyOnceWith('picked');
    expect(service.openCount).toBe(1);
    expect(hosts()).toHaveLength(1);
    expect(document.body.querySelector('app-child-dialog')).toBeNull();
    expect(document.body.querySelector('app-parent-dialog')).not.toBeNull();
    expect(parent.component.entered()).toBe('typed by the user');
    expect(parent.component.data()).toEqual({ initial: 'x' });
  });

  it('closes only the topmost dialog on Escape', async () => {
    const parentClosed = vi.fn();
    service.open(ParentDialog, { closed: parentClosed });
    await settle();
    const childClosed = vi.fn();
    service.open(ChildDialog, { closed: childClosed });
    await settle();

    pressEscape();
    await settle();

    expect(childClosed).toHaveBeenCalledTimes(1);
    expect(parentClosed).not.toHaveBeenCalled();
    expect(service.openCount).toBe(1);
    expect(document.body.querySelector('app-parent-dialog')).not.toBeNull();

    pressEscape();
    await settle();

    expect(parentClosed).toHaveBeenCalledTimes(1);
    expect(service.openCount).toBe(0);
    expect(hosts()).toHaveLength(0);
  });

  it('respects closeOnEsc on the topmost dialog', async () => {
    const closed = vi.fn();
    service.open(ParentDialog, { closed, closeOnEsc: false });
    await settle();

    pressEscape();
    await settle();

    expect(closed).not.toHaveBeenCalled();
    expect(service.openCount).toBe(1);
  });

  it('notifies every close channel exactly once when closed through the handle', async () => {
    const optionClosed = vi.fn();
    const handle = service.open(ParentDialog, { closed: optionClosed });
    await settle();
    const handleClosed = vi.fn();
    const componentClosed = vi.fn();
    handle.closed.subscribe(handleClosed);
    handle.component.closed.subscribe(componentClosed);

    handle.close('result');
    handle.close('again');
    await settle();

    expect(optionClosed).toHaveBeenCalledExactlyOnceWith('result');
    expect(handleClosed).toHaveBeenCalledExactlyOnceWith('result');
    expect(componentClosed).toHaveBeenCalledExactlyOnceWith('result');
    expect(hosts()).toHaveLength(0);
  });

  it('notifies every close channel exactly once when the component closes itself', async () => {
    const optionClosed = vi.fn();
    const handle = service.open(ParentDialog, { closed: optionClosed });
    await settle();
    const handleClosed = vi.fn();
    handle.closed.subscribe(handleClosed);

    handle.component.closed.emit('done');
    await settle();

    expect(optionClosed).toHaveBeenCalledExactlyOnceWith('done');
    expect(handleClosed).toHaveBeenCalledExactlyOnceWith('done');
    expect(hosts()).toHaveLength(0);
  });

  it('supports opening the next dialog from a closed callback', async () => {
    let second: ReturnType<typeof service.open<ChildDialog>> | undefined;
    const first = service.open(ParentDialog, {
      closed: () => {
        second = service.open(ChildDialog, {});
      },
    });
    await settle();

    first.close(null);
    await settle();

    expect(second).toBeDefined();
    expect(service.openCount).toBe(1);
    expect(document.body.querySelector('app-parent-dialog')).toBeNull();
    expect(document.body.querySelector('app-child-dialog')).not.toBeNull();
  });

  it('throws when data is passed to a component without a data input', () => {
    expect(() => service.open(ChildDialog, { data: { foo: 1 } } as never)).toThrowError(/data is not an input signal/);
    expect(hosts()).toHaveLength(0);
    expect(service.openCount).toBe(0);
  });
});
