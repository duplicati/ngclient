import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton, ShipDialogService, ShipIcon, ShipRadio, ShipToggle } from '@ship-ui/core';
import { TargetUrlDialog } from '../../backup/source-data/target-url-dialog/target-url-dialog';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreOptionsForm = () => {
  return fb.group({
    restoreFrom: fb.control<'original' | 'pickLocation' | 'same-o365' | 'other-o365'>('original'),
    restoreFromPath: fb.control<string>(''),
    handleExisting: fb.control<'overwrite' | 'saveTimestamp'>('saveTimestamp'),
    permissions: fb.control<boolean>(false),
    includeMetadata: fb.control<boolean>(true),
    officeIgnoreExisting: fb.control<boolean>(false),
  });
};

@Component({
  selector: 'app-advanced-options-settings',
  imports: [ReactiveFormsModule, ToggleCardComponent, FileTreeComponent, ShipToggle, ShipRadio, ShipButton, ShipIcon],
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
  extendedData = this.#restoreFlowState.extendedDataType;

  office365CustomTargetUrl = signal<string | null>(null);
  backupId = computed(() => this.#restoreFlowState.backup()?.Backup?.ID ?? null);
  hasOffice365Data = computed(() => this.extendedData() === 'o365');

  office365SourceUrl = computed(() => {
    const source = this.#restoreFlowState
      .backup()
      ?.Backup?.Sources?.filter((x) => x.startsWith('@') && x.includes('|office365'))[0];
    if (!source) return null;
    const parts = source.split('|');
    return parts.length >= 2 ? parts[1] : null;
  });

  office365destinationUrl = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    const hasO365Data = this.hasOffice365Data();

    if (mode === 'same-o365' && hasO365Data) {
      return this.office365SourceUrl();
    } else if (mode === 'other-o365' && hasO365Data) {
      return this.office365CustomTargetUrl();
    }

    return null;
  });

  showOffice365RestoreTree = computed(() => {
    if (this.optionsFormSignal()?.restoreFrom === 'same-o365' && this.office365destinationUrl() && this.backupId()) {
      return true;
    }
    if (this.optionsFormSignal()?.restoreFrom === 'other-o365' && this.office365destinationUrl()) {
      return true;
    }
    return false;
  });

  isOffice365Restore = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    return mode === 'same-o365' || mode === 'other-o365';
  });

  chooseOfficeTenant() {
    const dialogRef = this.#dialog.open(TargetUrlDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        targetUrlModel: this.office365CustomTargetUrl() || this.office365SourceUrl() || 'office365://',
        moduleType: 'RestoreDestinationProvider',
        askToCreate: true,
      },
    });

    dialogRef.closed.subscribe((targetUrl) => {
      if (!targetUrl) return;

      this.office365CustomTargetUrl.set(targetUrl);
      this.optionsForm.controls.restoreFrom.setValue('other-o365');
    });
    return false;
  }

  // Handle default selection changes based on data type
  #selectDefaultRestoreModeEffect = effect(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    if (this.hasOffice365Data() && (mode === 'original' || mode === undefined)) {
      this.optionsForm.controls.restoreFrom.setValue('pickLocation');
      this.optionsForm.controls.handleExisting.setValue('overwrite');
    }

    if (!this.hasOffice365Data() && (mode === 'same-o365' || mode === 'other-o365')) {
      this.optionsForm.controls.restoreFrom.setValue('original');
      this.optionsForm.controls.handleExisting.setValue('saveTimestamp');
    }
  });

  goBack() {
    this.#router.navigate(['select-files'], { relativeTo: this.#route.parent });
  }

  submit() {
    const files = this.#restoreFlowState.selectFilesFormSignal()?.filesToRestore ?? [];
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

    const restoreToOffice365 =
      this.optionsFormSignal()?.restoreFrom === 'same-o365' || this.optionsFormSignal()?.restoreFrom === 'other-o365';

    if (restoreToOffice365) {
      let path = this.optionsFormSignal()?.restoreFromPath;
      if (path && path.startsWith('/')) {
        path = path.substring(1);
      }

      if (!path || path.trim() === '') {
        this.#dialog.open(ConfirmDialogComponent, {
          data: {
            title: $localize`No path specified`,
            message: $localize`Please choose a path to restore to in the Office 365 tenant.`,
            confirmText: $localize`OK`,
            cancelText: undefined,
          },
        });
        return;
      }

      const checkForExisting = this.optionsFormSignal()?.officeIgnoreExisting;

      const queryParams = this.office365destinationUrl()?.substring(this.office365destinationUrl()!.indexOf('?'));
      const restorePath = `@office365://${path}${queryParams}&office365-ignore-existing=${checkForExisting ? 'true' : 'false'}`;
      this.#restoreFlowState.setAlternateRestorePath(restorePath);
      this.optionsForm.controls.includeMetadata.setValue(true);
      this.optionsForm.controls.permissions.setValue(true);
    } else {
      this.#restoreFlowState.setAlternateRestorePath(null);
    }

    this.#restoreFlowState.submit();
  }
}
