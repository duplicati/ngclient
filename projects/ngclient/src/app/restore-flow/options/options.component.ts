import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ShipButtonComponent,
  ShipDialogService,
  ShipIconComponent,
  ShipRadioComponent,
  ShipToggleComponent,
} from '@ship-ui/core';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreOptionsForm = () => {
  return fb.group({
    restoreFrom: fb.control<'original' | 'pickLocation'>('original'),
    restoreFromPath: fb.control<string>(''),
    handleExisting: fb.control<'overwrite' | 'saveTimestamp'>('overwrite'),
    permissions: fb.control<boolean>(false),
    includeMetadata: fb.control<boolean>(true),
  });
};

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    ReactiveFormsModule,
    ToggleCardComponent,
    FileTreeComponent,
    ShipToggleComponent,
    ShipRadioComponent,
    ShipButtonComponent,
    ShipIconComponent,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #sysinfoState = inject(SysinfoState);
  #dialog = inject(ShipDialogService);

  optionsForm = this.#restoreFlowState.optionsForm;
  optionsFormSignal = this.#restoreFlowState.optionsFormSignal;
  isSubmitting = this.#restoreFlowState.isSubmitting;

  goBack() {
    this.#router.navigate(['select-files'], { relativeTo: this.#route.parent });
  }

  submit() {
    const files = this.#restoreFlowState.selectFilesFormSignal()?.filesToRestore ?? [];
    console.log('Submitting restore with files:', files, this.optionsFormSignal()?.restoreFrom);
    if (files.length > 0 && this.optionsFormSignal()?.restoreFrom == 'original') {
      const sourceDirSep = files[0].includes('/') ? '/' : '\\';
      if (sourceDirSep !== this.#sysinfoState.systemInfo()?.DirectorySeparator) {
        this.#dialog.open(ConfirmDialogComponent, {
          data: {
            title: $localize`Confirm target folder`,
            message: $localize`This backup was created on another operating system. Restoring files without specifying a destination folder can cause files to be restored in unexpected places. Are you sure you want to continue without choosing a destination folder?`,
            confirmText: $localize`Yes`,
            cancelText: $localize`Cancel`,
          },
          closed: (res) => {
            if (!res) return;
            this.#restoreFlowState.submit();
          },
        });
        return;
      }
    }

    this.#restoreFlowState.submit();
  }
}
