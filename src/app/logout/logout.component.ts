import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppAuthState } from '../core/states/app-auth.state';

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogoutComponent {
  #auth = inject(AppAuthState);

  ngOnInit() {
    this.#auth.logout();
  }
}
