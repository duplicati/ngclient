import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';

@Component({
  selector: 'app-attribute-exclusions-dialog',
  imports: [ShipButton, ShipCheckbox, FormField],
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

  // Keep configured values the server does not list, so saving never drops them silently.
  options = computed(() => {
    const options = this.data()?.options ?? [];
    const known = new Set(options.map((x) => x.toLowerCase()));
    return [...options, ...(this.data()?.selected ?? []).filter((x) => !known.has(x.toLowerCase()))];
  });

  selected = linkedSignal(() => {
    const selected = new Set(this.data()?.selected.map((option) => option.toLowerCase()));
    return Object.fromEntries(
      this.options().map((option) => [option.toLowerCase(), selected.has(option.toLowerCase())])
    );
  });
  selectionForm = form(this.selected);

  submit() {
    // Emit in the listed order so the saved value is stable regardless of click order.
    this.closed.emit(this.options().filter((option) => this.selected()[option.toLowerCase()]));
  }
}
