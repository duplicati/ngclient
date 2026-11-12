import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../core/openapi';
import { AppAuthState } from '../../core/states/app-auth.state';
import { ChangePassphraseAlertDialogComponent } from './change-passphrase-alert-dialog.component';

describe('initial passphrase Signal Form', () => {
  afterEach(() => TestBed.resetTestingModule());
  function setup() {
    const response = new Subject<unknown>();
    const patch = vi.fn(() => response);
    const signOut = vi.fn();
    const closed = vi.fn();
    TestBed.configureTestingModule({
      imports: [ChangePassphraseAlertDialogComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { patchApiV1Serversettings: patch } },
        { provide: AppAuthState, useValue: { signOutAfterPassphraseChange: signOut } },
      ],
    });
    const fixture = TestBed.createComponent(ChangePassphraseAlertDialogComponent);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.detectChanges();
    const inputs = fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    const enter = (index: number, value: string) => {
      inputs[index].value = value;
      inputs[index].dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    const update = () =>
      Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find((x) =>
        x.textContent?.includes('Yes, update passphrase now')
      )!;
    return { fixture, component: fixture.componentInstance, inputs, enter, update, patch, response, signOut, closed };
  }
  it('disables confirmation until a passphrase is entered and preserves its value when disabled again', () => {
    const { fixture, component, inputs, enter, update } = setup();
    expect(inputs[1].disabled).toBe(true);
    expect(update().disabled).toBe(true);
    enter(0, 'secret');
    expect(inputs[1].disabled).toBe(false);
    enter(1, 'retained');
    enter(0, '');
    expect(inputs[1].disabled).toBe(true);
    expect(component.passphraseForm.repeatPassphrase().value()).toBe('retained');
    component.passphrase.set('secret');
    fixture.detectChanges();
    expect(inputs[1].value).toBe('retained');
  });
  it('keeps the update action disabled for mismatched passphrases and sends no request', () => {
    const { component, enter, update, patch } = setup();
    enter(0, 'one');
    enter(1, 'two');
    expect(update().disabled).toBe(true);
    component.updatePassphrase();
    expect(patch).not.toHaveBeenCalled();
  });
  it('sends the exact passphrase and closes then signs out only after successful saving', () => {
    const { fixture, component, enter, update, patch, response, signOut, closed } = setup();
    const password = ' new pass & + % ';
    enter(0, password);
    enter(1, password);
    expect(update().disabled).toBe(false);
    update().click();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ body: { 'server-passphrase': password } });
    expect(component.isUpdating()).toBe(true);
    expect(signOut).not.toHaveBeenCalled();
    expect(closed).not.toHaveBeenCalled();
    response.next({});
    response.complete();
    fixture.detectChanges();
    expect(closed).toHaveBeenCalledOnce();
    expect(signOut).toHaveBeenCalledOnce();
    expect(closed.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
    expect(component.isUpdating()).toBe(false);
  });
  it('defers changing the passphrase without signing out', () => {
    const { component, patch, response, signOut, closed } = setup();
    component.cancel();
    expect(patch).toHaveBeenCalledExactlyOnceWith({ body: { 'has-asked-for-password-change': 'True' } });
    expect(closed).not.toHaveBeenCalled();
    response.next({});
    response.complete();
    expect(closed).toHaveBeenCalledOnce();
    expect(signOut).not.toHaveBeenCalled();
    expect(component.isUpdating()).toBe(false);
  });
});
