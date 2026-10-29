import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { KeyboardActionDirective } from './keyboard-action.directive';

@Component({
  imports: [KeyboardActionDirective],
  template:
    '<div appKeyboardAction (click)="count = count + 1" [attr.aria-disabled]="disabled()"><button type="button">Child</button></div><div appKeyboardAction role="link" tabindex="-1"></div>',
})
class Host {
  count = 0;
  disabled = signal(false);
}

describe('keyboard actions', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const element = fixture.nativeElement.querySelector('div') as HTMLElement;
    const key = (type: string, key: string, target: HTMLElement = element, repeat = false) => {
      const event = new KeyboardEvent(type, { key, repeat, bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    return { fixture, element, key, host: fixture.componentInstance };
  }
  it('adds button semantics and preserves explicit role and tab order', () => {
    const { fixture, element } = setup();
    expect(element.getAttribute('role')).toBe('button');
    expect(element.tabIndex).toBe(0);
    const link = fixture.nativeElement.querySelectorAll('div')[1];
    expect(link.getAttribute('role')).toBe('link');
    expect(link.tabIndex).toBe(-1);
  });
  it('activates Enter once and ignores key repeats', () => {
    const { host, key } = setup();
    expect(key('keydown', 'Enter').defaultPrevented).toBe(true);
    key('keydown', 'Enter', undefined, true);
    key('keyup', 'Enter');
    expect(host.count).toBe(1);
  });
  it('prevents Space scrolling and activates on release once', () => {
    const { host, key } = setup();
    expect(key('keydown', ' ').defaultPrevented).toBe(true);
    expect(host.count).toBe(0);
    key('keyup', ' ');
    key('keyup', ' ');
    expect(host.count).toBe(1);
  });
  it('does not activate keys bubbling from nested controls', () => {
    const { element, host, key } = setup();
    const child = element.querySelector('button')!;
    key('keydown', 'Enter', child);
    key('keydown', ' ', child);
    key('keyup', ' ', child);
    expect(host.count).toBe(0);
    child.click();
    expect(host.count).toBe(1);
  });
  it('does not activate disabled controls, including between Space down and up', () => {
    const { fixture, host, key } = setup();
    key('keydown', ' ');
    host.disabled.set(true);
    fixture.detectChanges();
    key('keyup', ' ');
    key('keydown', 'Enter');
    expect(host.count).toBe(0);
  });
  it('clears a pending Space on blur and leaves Tab alone', () => {
    const { element, host, key } = setup();
    key('keydown', ' ');
    element.dispatchEvent(new FocusEvent('blur'));
    key('keyup', ' ');
    expect(host.count).toBe(0);
    expect(key('keydown', 'Tab').defaultPrevented).toBe(false);
  });
});
