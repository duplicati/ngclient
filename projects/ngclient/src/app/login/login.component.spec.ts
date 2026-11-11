import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LOCALSTORAGE } from '../core/services/localstorage.token';
import { AppAuthState } from '../core/states/app-auth.state';
import LoginComponent from './login.component';

describe('login Signal Form', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });
  function setup(remember = false) {
    const response = new Subject<void>();
    const login = vi.fn((_password: string, _remember: boolean) => response);
    const navigate = vi.fn();
    const setItemParsed = vi.fn();
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: Router, useValue: { navigate } },
        { provide: AppAuthState, useValue: { login } },
        { provide: LOCALSTORAGE, useValue: { getItemParsed: () => remember, setItemParsed } },
      ],
    });
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    const password = fixture.nativeElement.querySelector('input[autocomplete="current-password"]') as HTMLInputElement;
    const checkbox = fixture.nativeElement.querySelector('input[type=checkbox]') as HTMLInputElement;
    const submit = () => {
      const event = new Event('submit', { cancelable: true });
      fixture.nativeElement.querySelector('form').dispatchEvent(event);
      fixture.detectChanges();
      return event;
    };
    const enter = (value: string) => {
      password.value = value;
      password.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return {
      fixture,
      component: fixture.componentInstance,
      password,
      checkbox,
      submit,
      enter,
      login,
      response,
      navigate,
      setItemParsed,
    };
  }

  it.each([false, true])('loads and persists the remember-me checkbox (%s)', (remember) => {
    const { fixture, checkbox, component, setItemParsed } = setup(remember);
    expect(checkbox.checked).toBe(remember);
    checkbox.click();
    fixture.detectChanges();
    expect(component.loginForm.rememberMe().value()).toBe(!remember);
    expect(component.rememberMe()).toBe(!remember);
    expect(setItemParsed).toHaveBeenCalledWith('rememberMe', !remember, true);
  });

  it('requires a password and prevents native submission without sending an empty password', () => {
    const { component, submit, login } = setup();
    expect(component.loginForm.pass().invalid()).toBe(true);
    expect(submit().defaultPrevented).toBe(true);
    expect(login).not.toHaveBeenCalled();
  });

  it('submits the exact password and current remember-me choice and navigates on success', () => {
    const { fixture, component, checkbox, enter, submit, login, response, navigate } = setup();
    enter(' secret & + % password ');
    checkbox.click();
    fixture.detectChanges();
    expect(component.loginForm.pass().valid()).toBe(true);
    submit();
    expect(login).toHaveBeenCalledExactlyOnceWith(' secret & + % password ', true);
    expect(component.isLoading()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
    response.next();
    response.complete();
    fixture.detectChanges();
    expect(component.isLoading()).toBe(false);
    expect(component.successLogin()).toBe(true);
    expect(navigate).toHaveBeenCalledExactlyOnceWith(['/']);
    expect(fixture.nativeElement.querySelector('sh-alert')).toBeNull();
  });

  it('renders a null password as empty and does not authenticate it', () => {
    const { fixture, component, password, submit, login } = setup();
    component.loginForm.pass().value.set(null);
    fixture.detectChanges();
    expect(password.value).toBe('');
    expect(component.loginForm.pass().invalid()).toBe(true);
    submit();
    expect(login).not.toHaveBeenCalled();
  });

  it('keeps input after an unsuccessful login and permits retry', async () => {
    const { fixture, component, password, enter, submit, response, login, navigate } = setup();
    enter('wrong password');
    submit();
    response.complete();
    fixture.detectChanges();
    await Promise.resolve();
    expect(component.isLoading()).toBe(false);
    expect(component.failedLogin()).toBe(true);
    expect(password.value).toBe('wrong password');
    expect(fixture.nativeElement.querySelector('sh-alert')).not.toBeNull();
    expect(navigate).not.toHaveBeenCalled();
    const retry = new Subject<void>();
    login.mockReturnValue(retry);
    enter('new password');
    submit();
    expect(login).toHaveBeenLastCalledWith('new password', false);
  });

  it('toggles password visibility by keyboard without changing the password', () => {
    const { fixture, password, enter } = setup();
    enter('unchanged');
    const toggle = fixture.nativeElement.querySelector('[aria-label="Toggle password visibility"]') as HTMLElement;
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    expect(password.type).toBe('text');
    expect(password.value).toBe('unchanged');
    toggle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    toggle.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    expect(password.type).toBe('password');
  });
});
