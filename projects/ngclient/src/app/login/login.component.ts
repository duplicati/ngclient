import { KeyboardActionDirective } from '../core/directives/keyboard-action.directive';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  ElementRef,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { form, FormField, required } from '@angular/forms/signals';
import { NullableTextControl } from '../backup/general/nullable-text-control';
import { Router } from '@angular/router';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { finalize } from 'rxjs';
import LogoComponent from '../core/components/logo/logo.component';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { AppAuthState } from '../core/states/app-auth.state';

@Component({
  selector: 'app-login',
  imports: [
    KeyboardActionDirective,
    FormField,
    NullableTextControl,
    LogoComponent,
    ShipFormField,
    ShipIcon,
    ShipButton,
    ShipAlert,
    ShipCheckbox,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginComponent {
  #router = inject(Router);
  #auth = inject(AppAuthState);

  rememberMe = localStorageSignal('rememberMe', false, true);
  failedLogin = signal(false);
  successLogin = signal(false);
  isLoading = signal(false);
  loginForm = form(
    signal<{ pass: string | null; rememberMe: boolean }>({ pass: '', rememberMe: this.rememberMe() }),
    (path) => required(path.pass)
  );
  rememberMeEffect = effect(() => {
    const remember = this.loginForm.rememberMe().value();
    if (remember !== untracked(this.rememberMe)) this.rememberMe.set(remember);
  });
  showPassword = signal(false);
  passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  passwordEffect = effect(() => {
    if (this.failedLogin()) {
      queueMicrotask(() => this.passwordInput()?.nativeElement?.focus());
    }
  });

  ngOnInit() {
    queueMicrotask(() => this.passwordInput()?.nativeElement?.focus());
  }

  submit() {
    const password = this.loginForm.pass().value();
    this.rememberMe.set(this.loginForm.rememberMe().value());

    if (!password) return;

    this.isLoading.set(true);

    this.#auth
      .login(password, this.rememberMe())
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.failedLogin.set(true);
        })
      )
      .subscribe({
        next: () => {
          this.successLogin.set(true);
          this.#router.navigate(['/']);
        },
      });
  }
}
