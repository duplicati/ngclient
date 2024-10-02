import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { SparkleButtonComponent, SparkleFormFieldComponent, SparkleIconComponent } from '@sparkle-ui/core';
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

  loginForm = fb.group({
    pass: fb.control<string>('', Validators.required),
  });

  submit() {
    if (!this.loginForm.value.pass) {
      return;
    }

    this.#auth.login(this.loginForm.value.pass!).subscribe({
      next: () => this.#router.navigate(['/']),
    });
  }
}
