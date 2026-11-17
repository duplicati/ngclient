import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipCheckbox } from '@ship-ui/core/ship-checkbox';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { QueueCompletionAction } from '../../core/openapi';

export type StartAllDialogBackup = { id: string; name: string };

// The picked backups, and what to do with the computer when they have all completed
export type StartAllDialogResult = { ids: string[]; afterAction: QueueCompletionAction };

export type StartAllDialogAfterActionOption = { value: QueueCompletionAction; label: string };

// The order the actions are listed in
const AFTER_ACTION_LABELS: StartAllDialogAfterActionOption[] = [
  { value: 'Shutdown', label: $localize`Shut down the computer` },
  { value: 'Reboot', label: $localize`Restart the computer` },
  { value: 'RunScript', label: $localize`Run the script from the settings` },
];

@Component({
  selector: 'app-start-all-dialog',
  imports: [FormsModule, ShipButton, ShipCheckbox, ShipSelect],
  templateUrl: './start-all-dialog.html',
  styleUrl: './start-all-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StartAllDialog {
  // afterActions holds the actions the server is allowed to perform on its computer, which can be none
  data = input<{ backups: StartAllDialogBackup[]; afterActions: QueueCompletionAction[] }>();
  closed = output<StartAllDialogResult | null>();

  backups = computed(() => this.data()?.backups ?? []);
  // The actions the server can perform, which holds a script only when one is set in the server settings
  supportedAfterActions = computed(() => {
    const supported = this.data()?.afterActions ?? [];
    return AFTER_ACTION_LABELS.filter((x) => supported.includes(x.value));
  });
  // The choices in the dropdown, which always starts with doing nothing
  afterActionOptions = computed<StartAllDialogAfterActionOption[]>(() => [
    { value: 'None', label: $localize`Do nothing` },
    ...this.supportedAfterActions(),
  ]);
  selected = signal<ReadonlySet<string>>(new Set());
  allSelected = computed(() => this.selected().size === this.backups().length);
  noneSelected = computed(() => this.selected().size === 0);

  afterAction = signal<QueueCompletionAction>('None');

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

  setAfterAction(action: QueueCompletionAction | null) {
    this.afterAction.set(action ?? 'None');
  }

  submit() {
    // Emit in the listed order, as the backups are queued one after another
    const selected = this.selected();
    const afterAction = this.afterAction();
    this.closed.emit({
      ids: this.backups()
        .map((x) => x.id)
        .filter((id) => selected.has(id)),
      afterAction: this.supportedAfterActions().some((x) => x.value === afterAction) ? afterAction : 'None',
    });
  }
}
