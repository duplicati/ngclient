import { ChangeDetectionStrategy, Component, inject, signal, ViewChild, ElementRef, OnInit, effect } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { Router } from '@angular/router';
import {
  SparkleAlertComponent,
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { AppAuthState } from '../core/states/app-auth.state';
import LogoComponent from "../core/components/logo/logo.component";

const fb = new FormBuilder();

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleAlertComponent,
    LogoComponent
],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginComponent implements OnInit {
  @ViewChild('passwordInput') passwordInput!: ElementRef;
  #router = inject(Router);
  #auth = inject(AppAuthState);

  failedLogin = signal(false);
  isLoading = signal(false);
  loginForm = fb.group({
    user: fb.control<string>(''), // Used as a honeypot to prevent autofill
    pass: fb.control<string>('', Validators.required),
  });

  constructor() {
    effect(() => {
      if (this.failedLogin()) {
        setTimeout(() => {
          this.passwordInput?.nativeElement?.focus();
        }, 0);
      }
    });
  }

  ngOnInit() {
    setTimeout(() => {
      this.passwordInput?.nativeElement?.focus();
    }, 0);
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
