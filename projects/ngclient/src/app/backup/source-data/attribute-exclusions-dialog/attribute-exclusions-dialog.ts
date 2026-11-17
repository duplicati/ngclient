import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';

@Component({
  selector: 'app-attribute-exclusions-dialog',
  imports: [ShipButton, ShipCheckbox],
  templateUrl: './attribute-exclusions-dialog.html',
  styleUrl: './attribute-exclusions-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributeExclusionsDialog {
  data = input<{
    selected: string[];
    options: string[];
  }>();
  closed = output<string[] | null>();

  selected = signal<string[]>([]);
  // Keep configured values the server does not list, so saving never drops them silently.
  options = computed(() => {
    const options = this.data()?.options ?? [];
    const known = new Set(options.map((x) => x.toLowerCase()));
    return [...options, ...(this.data()?.selected ?? []).filter((x) => !known.has(x.toLowerCase()))];
  });

  dataEffect = effect(() => {
    this.selected.set(this.data()?.selected ?? []);
  });

  isSelected(option: string) {
    return this.selected().some((x) => x.toLowerCase() === option.toLowerCase());
  }

  toggle(option: string, checked: boolean) {
    const others = this.selected().filter((x) => x.toLowerCase() !== option.toLowerCase());
    this.selected.set(checked ? [...others, option] : others);
  }

  submit() {
    // Emit in the listed order so the saved value is stable regardless of click order.
    this.closed.emit(this.options().filter((x) => this.isSelected(x)));
  }
}
