import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButtonComponent, ShipCardComponent, ShipDividerComponent, ShipIconComponent } from '@ship-ui/core';

@Component({
  selector: 'app-select',
  imports: [RouterLink, ShipCardComponent, ShipIconComponent, ShipDividerComponent, ShipButtonComponent],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Select {
  hoveringConnect = signal(false);
}
