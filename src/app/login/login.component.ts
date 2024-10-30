import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent } from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { AppAuthState } from '../core/states/app-auth.state';

const fb = new FormBuilder();

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule, SparkleFormFieldComponent, SparkleIconComponent, SparkleButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LoginComponent {
  #router = inject(Router);
  #auth = inject(AppAuthState);

  isLoading = signal(false);
  loginForm = fb.group({
    pass: fb.control<string>('', Validators.required),
  });

  submit() {
    const password = this.loginForm.value.pass;

    if (!password) return;

    this.isLoading.set(true);

    this.#auth
      .login(password)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: () => this.#router.navigate(['/']),
      });
  }
}
