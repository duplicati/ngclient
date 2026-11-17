import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';

export type StartAllDialogBackup = { id: string; name: string };

@Component({
  selector: 'app-start-all-dialog',
  imports: [ShipButton, ShipCheckbox],
  templateUrl: './start-all-dialog.html',
  styleUrl: './start-all-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StartAllDialog {
  data = input<{ backups: StartAllDialogBackup[] }>();
  closed = output<string[] | null>();

  backups = computed(() => this.data()?.backups ?? []);
  selected = signal<ReadonlySet<string>>(new Set());
  allSelected = computed(() => this.selected().size === this.backups().length);
  noneSelected = computed(() => this.selected().size === 0);

  // Every backup starts out picked, so confirming right away starts them all
  dataEffect = effect(() => {
    this.selected.set(new Set(this.backups().map((x) => x.id)));
  });

  toggle(id: string, checked: boolean) {
    const next = new Set(this.selected());
    if (checked) next.add(id);
    else next.delete(id);
    this.selected.set(next);
  }

  selectAll() {
    this.selected.set(new Set(this.backups().map((x) => x.id)));
  }

  selectNone() {
    this.selected.set(new Set());
  }

  submit() {
    // Emit in the listed order, as the backups are queued one after another
    const selected = this.selected();
    this.closed.emit(
      this.backups()
        .map((x) => x.id)
        .filter((id) => selected.has(id))
    );
  }
}
