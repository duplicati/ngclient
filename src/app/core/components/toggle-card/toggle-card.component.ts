import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { SparkleIconComponent } from '@sparkle-ui/core';

@Component({
  selector: 'app-toggle-card',
  standalone: true,
  imports: [SparkleIconComponent],
  templateUrl: './toggle-card.component.html',
  styleUrl: './toggle-card.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.active]': 'isActive()',
  },
})
export default class ToggleCardComponent {
  isActive = model(false);
  disallowToggle = input(false);

  ngOnInit() {
    if (this.disallowToggle()) {
      this.isActive.set(true);
    }
  }

  toggle() {
    this.isActive.set(!this.isActive());
  }
}
