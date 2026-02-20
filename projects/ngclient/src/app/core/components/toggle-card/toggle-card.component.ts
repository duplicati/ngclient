import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ShipIcon } from '@ship-ui/core';

@Component({
  selector: 'app-toggle-card',
  imports: [ShipIcon],
  templateUrl: './toggle-card.component.html',
  styleUrl: './toggle-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.active]': 'isActive()',
  },
})
export default class ToggleCardComponent {
  isActive = model(false);
  disableToggle = input(false);

  ngOnInit() {
    if (this.disableToggle()) {
      this.isActive.set(true);
    }
  }

  toggle() {
    this.isActive.set(!this.isActive());
  }
}
