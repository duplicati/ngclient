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
    restoreFrom: fb.control<'original' | 'pickLocation' | 'same-custom' | 'other-custom'>('original'),
    restoreFromPath: fb.control<string>(''),
    handleExisting: fb.control<'overwrite' | 'saveTimestamp'>('saveTimestamp'),
    permissions: fb.control<boolean>(false),
    includeMetadata: fb.control<boolean>(true),
    customRemoteIgnoreExisting: fb.control<boolean>(false),
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

  remoteCustomTargetUrl = signal<string | null>(null);
  backupId = computed(() => this.#restoreFlowState.backup()?.Backup?.ID ?? null);
  extendedDataType = computed(() => {
    const type = this.#restoreFlowState.extendedDataType();
    if (type === 'o365') {
      return 'o365';
    } else if (type === 'gsuite') {
      return 'gsuite';
    }
    return null;
  });

  remoteCustomSourceEntry = computed(
    () =>
      this.#restoreFlowState
        .backup()
        ?.Backup?.Sources?.filter(
          (x) => x.startsWith('@') && (x.includes('|office365://') || x.includes('|googleworkspace://'))
        )[0] ?? null
  );

  remoteCustomSourceUrl = computed(() => this.remoteCustomSourceEntry()?.split('|')[1] ?? null);
  remoteCustomSourcePrefix = computed(() => this.remoteCustomSourceEntry()?.split('|')[0] ?? null);

  customDestinationUrl = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    const hasExtendedData = this.extendedDataType() !== null;

    if (mode === 'same-custom' && hasExtendedData) {
      return this.remoteCustomSourceUrl();
    } else if (mode === 'other-custom' && hasExtendedData) {
      return this.remoteCustomTargetUrl();
    }

    return null;
  });

  showCustomRemoteRestoreTree = computed(() => {
    if (this.optionsFormSignal()?.restoreFrom === 'same-custom' && this.customDestinationUrl() && this.backupId()) {
      return true;
    }
    if (this.optionsFormSignal()?.restoreFrom === 'other-custom' && this.customDestinationUrl()) {
      return true;
    }
    return false;
  });

  isCustomRemoteRestore = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    return mode === 'same-custom' || mode === 'other-custom';
  });

  chooseCustomRemoteDestination() {
    const defaultUrlPrefix = this.extendedDataType() === 'o365' ? 'office365://' : 'googleworkspace://';

    const dialogRef = this.#dialog.open(TargetUrlDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        targetUrlModel: this.remoteCustomTargetUrl() || this.remoteCustomSourceUrl() || defaultUrlPrefix,
        moduleType: 'RestoreDestinationProvider',
        askToCreate: true,
        expectedResult: 'any',
        suppressErrorDialogs: true,
        backupId: this.backupId(),
        sourcePrefix: this.remoteCustomSourcePrefix(),
      },
    });

    dialogRef.closed.subscribe((targetUrl) => {
      if (!targetUrl) return;

      this.remoteCustomTargetUrl.set(targetUrl);
      this.optionsForm.controls.restoreFrom.setValue('other-custom');
    });
    return false;
  }

  // Handle default selection changes based on data type
  #selectDefaultRestoreModeEffect = effect(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    if (this.extendedDataType() != null && (mode === 'original' || mode === undefined)) {
      this.optionsForm.controls.restoreFrom.setValue('pickLocation');
      this.optionsForm.controls.handleExisting.setValue('overwrite');
    }

    if (this.extendedDataType() == null && (mode === 'same-custom' || mode === 'other-custom')) {
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

    const restoreToCustomRemote =
      this.optionsFormSignal()?.restoreFrom === 'same-custom' ||
      this.optionsFormSignal()?.restoreFrom === 'other-custom';

    if (restoreToCustomRemote) {
      let path = this.optionsFormSignal()?.restoreFromPath;
      if (path && path.startsWith('/')) {
        path = path.substring(1);
      }

      if (!path || path.trim() === '') {
        this.#dialog.open(ConfirmDialogComponent, {
          data: {
            title: $localize`No path specified`,
            message:
              this.extendedDataType() === 'gsuite'
                ? $localize`Please choose a path to restore to in the Google Workspace account.`
                : $localize`Please choose a path to restore to in the Office 365 tenant.`,
            confirmText: $localize`OK`,
            cancelText: undefined,
          },
        });
        return;
      }

      const checkForExisting = this.optionsFormSignal()?.customRemoteIgnoreExisting;

      const queryParams = this.customDestinationUrl()?.substring(this.customDestinationUrl()!.indexOf('?'));
      const restorePath =
        this.extendedDataType() === 'gsuite'
          ? `@googleworkspace://${encodeURIComponent(path)}${queryParams}&google-ignore-existing=${checkForExisting ? 'true' : 'false'}`
          : `@office365://${encodeURIComponent(path)}${queryParams}&office365-ignore-existing=${checkForExisting ? 'true' : 'false'}`;
      this.#restoreFlowState.setAlternateRestorePath(restorePath, this.remoteCustomSourcePrefix());
      this.optionsForm.controls.includeMetadata.setValue(true);
      this.optionsForm.controls.permissions.setValue(true);
    } else {
      this.#restoreFlowState.setAlternateRestorePath(null, null);
    }

    this.#restoreFlowState.submit();
  }
}
