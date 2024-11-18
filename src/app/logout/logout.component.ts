import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { SparkleButtonComponent } from '@sparkle-ui/core';
import CustomCardComponent from '../core/components/custom-card/custom-card.component';
import { AppAuthState } from '../core/states/app-auth.state';

@Component({
  selector: 'app-logout',
  standalone: true,
  imports: [CustomCardComponent, SparkleButtonComponent],
  templateUrl: './logout.component.html',
  styleUrl: './logout.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class LogoutComponent {
  #auth = inject(AppAuthState);

  isLoggingOut = this.#auth.isLoggingOut;

  ngOnInit() {
    this.#auth.logout();
  }
}
