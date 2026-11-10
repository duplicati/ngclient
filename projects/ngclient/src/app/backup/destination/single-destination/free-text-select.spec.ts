import { Component, computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { isSelectBlankingEvent, syncFreeTextSelection } from './single-destination.component';

/** Mirrors the free-text server select in single-destination.component.html. */
@Component({
  imports: [ShipSelect, FormsModule],
  template: `
    <sh-select
      #select
      [options]="options()"
      (isOpenChange)="!$event && onClosed(select)"
      [asFreeText]="true"
      [inlineSearch]="true"
      [isClearable]="false"
      label="key"
      value="value">
      <input type="text" [ngModel]="value()" (input)="onInput($event)" />
    </sh-select>
  `,
})
class FreeTextSelectHost {
  value = signal('');
  options = computed(() => {
    const options = [{ key: 'Region A', value: 'a.example.com' }];
    const current = this.value();
    if (current && !options.some((x) => x.value === current)) options.push({ key: current, value: current });
    return options;
  });

  onClosed(select: ShipSelect) {
    syncFreeTextSelection(select, () => this.value());
  }

  onInput(event: Event) {
    if (isSelectBlankingEvent(event)) return;
    this.value.set((event.target as HTMLInputElement).value);
  }
}

describe('free-text server select', () => {
  let fixture: ComponentFixture<FreeTextSelectHost>;
  let input: HTMLInputElement;
  let select: ShipSelect;

  beforeAll(() => {
    // jsdom has no popover API
    (HTMLElement.prototype as any).showPopover ??= function () {};
    (HTMLElement.prototype as any).hidePopover ??= function () {};
  });

  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  const settle = async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  const setup = async () => {
    fixture = TestBed.createComponent(FreeTextSelectHost);
    await settle();
    input = fixture.nativeElement.querySelector('input');
    select = fixture.debugElement.query((d) => d.componentInstance instanceof ShipSelect)
      .componentInstance as ShipSelect;
    return fixture.componentInstance;
  };

  const type = async (text: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, text);
    input.dispatchEvent(new Event('input'));
    await settle();
  };

  const openAndClose = async () => {
    input.dispatchEvent(new Event('focus'));
    await settle();
    expect(select.isOpen()).toBe(true);
    select.close();
    await settle();
  };

  it('keeps a value set from outside, e.g. a pasted URL, when the dropdown is opened and closed', async () => {
    const host = await setup();
    host.value.set('ns.compat.objectstorage.eu-frankfurt-1.oci.customer-oci.com');
    await settle();

    await openAndClose();
    expect(host.value()).toBe('ns.compat.objectstorage.eu-frankfurt-1.oci.customer-oci.com');

    await openAndClose();
    expect(host.value()).toBe('ns.compat.objectstorage.eu-frankfurt-1.oci.customer-oci.com');
  });

  it('keeps a typed value when the dropdown is reopened', async () => {
    const host = await setup();
    input.dispatchEvent(new Event('focus'));
    await settle();
    await type('typed.example.com');
    select.close();
    await settle();
    expect(host.value()).toBe('typed.example.com');

    await openAndClose();
    expect(host.value()).toBe('typed.example.com');
  });

  /** The text the closed select shows. */
  const shownValue = () =>
    (fixture.nativeElement.querySelector('.selected-value')?.textContent ?? '').replace(/\s+/g, ' ').trim();

  it('shows the typed text, not the previous pick, after typing and clicking outside', async () => {
    const host = await setup();
    host.value.set('ns.compat.objectstorage.eu-frankfurt-1.oci.customer-oci.com');
    await settle();

    input.dispatchEvent(new Event('focus'));
    await settle();
    await type('ab');
    select.close();
    await settle();

    expect(host.value()).toBe('ab');
    expect(select.selectedOptions()).toEqual([{ key: 'ab', value: 'ab' }]);
    expect(shownValue()).toBe('ab');
  });

  it('applies an option picked from the list', async () => {
    const host = await setup();
    host.value.set('old.example.com');
    await settle();

    input.dispatchEvent(new Event('focus'));
    await settle();
    const index = select.filteredOptions().findIndex((x: any) => x.value === 'a.example.com');
    select.toggleOptionByIndex(index);
    await settle();

    expect(host.value()).toBe('a.example.com');
    expect(shownValue()).toBe('a.example.com');
  });

  it('only ignores empty input events the user did not cause', () => {
    const target = document.createElement('input');
    const event = (value: string) => {
      target.value = value;
      const e = new Event('input');
      Object.defineProperty(e, 'target', { value: target });
      return e;
    };
    // Events created by script are untrusted, like the ones sh-select dispatches
    expect(isSelectBlankingEvent(event(''))).toBe(true);
    expect(isSelectBlankingEvent(event('host'))).toBe(false);
  });
});
