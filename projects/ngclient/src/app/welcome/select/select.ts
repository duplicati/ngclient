import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ShipButton, ShipDivider } from '@ship-ui/core';

@Component({
  selector: 'app-select',
  imports: [RouterLink, ShipDivider, ShipButton],
  templateUrl: './select.html',
  styleUrl: './select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class Select {
  hoveringConnect = signal(false);
}
