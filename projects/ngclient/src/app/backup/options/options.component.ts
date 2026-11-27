import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipSelect } from '@ship-ui/core/ship-select';
import { TimespanComponent } from '../../core/components/timespan/timespan.component';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { NullableTextControl } from '../general/nullable-text-control';
import { OptionsListComponent } from './options-list/options-list.component';

import { RetentionType, SYNC_SNAPSHOT_OPTION_NAMES } from '../models/backup-options';

const RETENTION_OPTIONS: { value: RetentionType; name: string }[] = [
  {
    value: 'all',
    name: $localize`Keep all backups`,
  },
  {
    value: 'time',
    name: $localize`Delete backups that are older than`,
  },
  {
    value: 'versions',
    name: $localize`Keep a specific number of backups`,
  },
  {
    value: 'smart',
    name: $localize`Smart backup retention`,
  },
  {
    value: 'custom',
    name: $localize`Custom backup retention`,
  },
];

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    FormField,
    NullableTextControl,
    OptionsListComponent,
    TimespanComponent,
    ShipButton,
    ShipIcon,
    ShipSelect,
    ShipFormField,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  isSubmitting = this.#backupState.isSubmitting;
  advancedOptionsField = form(this.#backupState.settings);
  settings = this.advancedOptionsField().value;
  optionsForm = this.#backupState.optionsForm;
  applicationOptions = this.#backupState.applicationOptions;
  /** Only a backup stored on the server has a password the server can fill in for a test email */
  savedBackupId = computed(() =>
    this.#backupState.isNew() || this.#backupState.isDraft() ? null : this.#backupState.backupId()
  );
  isSyncMode = this.#backupState.isSyncMode;
  hasSyncSnapshots = inject(SysinfoState).hasSyncSnapshots;

  retentionOptions = signal(RETENTION_OPTIONS);
  retentionField = form(linkedSignal<string>(() => this.optionsForm.backupRetention().value()));
  syncSnapshotOptionNames = SYNC_SNAPSHOT_OPTION_NAMES;

  onRetentionFocusOut(event: FocusEvent, select: ShipSelect) {
    const host = event.currentTarget as HTMLElement;
    if (event.relatedTarget instanceof Node && !host.contains(event.relatedTarget)) {
      select.close();
    }
  }

  updateRetention(selected: unknown[]) {
    const option = this.retentionOptions().find((entry) => entry === selected[0]);
    const retention = this.optionsForm.backupRetention().value;
    if (option && option.value !== retention()) retention.set(option.value);
  }

  goBack() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }

  submit() {
    const validation = this.#backupState.validateBeforeSubmit();
    switch (validation) {
      case 'general':
        this.#router.navigate(['general'], { relativeTo: this.#route.parent });
        return;
      case 'destination':
        this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
        return;
      case 'source':
        this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
        return;
    }

    this.#backupState.submit();
  }
}
