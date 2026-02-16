import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShipButton, ShipIcon } from '@ship-ui/core';
import { LayoutState } from '../../../layout/layout.state';

@Component({
  selector: 'app-mobile-menu-toggle',
  standalone: true,
  imports: [ShipButton, ShipIcon],
  templateUrl: './mobile-menu-toggle.component.html',
  styleUrl: './mobile-menu-toggle.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileMenuToggleComponent {
  #layoutState = inject(LayoutState);

  isNavOpen = this.#layoutState.isNavOpen;
  isMobile = this.#layoutState.isMobile;

  toggleNav() {
    this.#layoutState.toggleNav();
  }
}
