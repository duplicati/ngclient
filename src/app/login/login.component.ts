import { ChangeDetectionStrategy, Component, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import {
  SparkleAlertComponent,
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import LogoComponent from '../core/components/logo/logo.component';
import { AppAuthState } from '../core/states/app-auth.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    LogoComponent,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleAlertComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginComponent {
  #router = inject(Router);
  #auth = inject(AppAuthState);

  failedLogin = signal(false);
  isLoading = signal(false);
  loginForm = fb.group({
    user: fb.control<string>(''), // Used as a honeypot to prevent autofill
    pass: fb.control<string>('', Validators.required),
  });
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
    const password = this.loginForm.value.pass;
    const username = this.loginForm.value.user;

    if (username) return; // Honeypot
    if (!password) return;

    this.isLoading.set(true);

    this.#auth
      .login(password)
      .pipe(
        finalize(() => {
          this.isLoading.set(false);
          this.failedLogin.set(true);
        })
      )
      .subscribe({
        next: () => this.#router.navigate(['/']),
      });
  }
}
