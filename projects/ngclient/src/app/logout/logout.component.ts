import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core';
import CustomCardComponent from '../core/components/custom-card/custom-card.component';
import { AppAuthState } from '../core/states/app-auth.state';

@Component({
  selector: 'app-logout',
  imports: [CustomCardComponent, ShipButton, RouterLink],
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
