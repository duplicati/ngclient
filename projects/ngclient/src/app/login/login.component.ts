import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ShipAlertComponent,
  ShipButtonComponent,
  ShipCheckboxComponent,
  ShipFormFieldComponent,
  ShipIconComponent,
} from '@ship-ui/core';
import { finalize } from 'rxjs';
import LogoComponent from '../core/components/logo/logo.component';
import { localStorageSignal } from '../core/functions/localstorage-signal';
import { AppAuthState } from '../core/states/app-auth.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    LogoComponent,
    ShipFormFieldComponent,
    ShipIconComponent,
    ShipButtonComponent,
    ShipAlertComponent,
    ShipCheckboxComponent,
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
  loginForm = fb.group({
    user: fb.control<string>(''), // Used as a honeypot to prevent autofill
    pass: fb.control<string>('', Validators.required),
    rememberMe: fb.control<boolean>(this.rememberMe()),
  });
  showPassword = signal(false);
  passwordInput = viewChild<ElementRef<HTMLInputElement>>('passwordInput');
  passwordEffect = effect(() => {
    if (this.failedLogin()) {
      queueMicrotask(() => this.passwordInput()?.nativeElement?.focus());
    }
  });

  ngOnInit() {
    this.loginForm.controls.rememberMe.valueChanges.subscribe((v) => this.rememberMe.set(v ?? false));

    queueMicrotask(() => this.passwordInput()?.nativeElement?.focus());
  }

  submit() {
    const password = this.loginForm.value.pass;
    const username = this.loginForm.value.user;
    this.rememberMe.set(this.loginForm.value.rememberMe ?? false);

    if (username) return; // Honeypot
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
