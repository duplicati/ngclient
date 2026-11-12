import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipRadio } from '@ship-ui/core/ship-radio';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { OptionsListComponent } from '../../backup/options/options-list/options-list.component';
import { CustomRemotePermissionsDialog } from '../../backup/source-data/custom-remote-permissions-dialog/custom-remote-permissions-dialog';
import { TargetUrlDialog } from '../../backup/source-data/target-url-dialog/target-url-dialog';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { RestoreFlowState } from '../restore-flow.state';
import {
  buildImageFileRestorePath,
  defaultImageFileName,
  IMAGE_FILE_MODULE_KEY,
  IMAGE_FORMAT_OPTION,
  IMAGE_PREALLOCATE_OPTION,
  ImageFileFormat,
  imageFormatFromName,
  setImageExtension,
} from './image-file-target';
import { RESTORE_OPTION_DEFAULTS } from './restore-option-defaults';

const fb = new FormBuilder();

export const createRestoreOptionsForm = () => {
  return fb.group({
    restoreFrom: fb.control<
      'original' | 'pickLocation' | 'same-custom' | 'other-custom' | 'diskimage' | 'diskimage-file'
    >('original'),
    restoreFromPath: fb.control<string>(''),
    handleExisting: fb.control<'overwrite' | 'saveTimestamp'>(RESTORE_OPTION_DEFAULTS.handleExisting),
    permissions: fb.control<boolean>(RESTORE_OPTION_DEFAULTS.permissions),
    includeMetadata: fb.control<boolean>(RESTORE_OPTION_DEFAULTS.includeMetadata),
    customRemoteIgnoreExisting: fb.control<boolean>(false),
    registerRestoredItems: fb.control<boolean>(false),
    imageFolder: fb.control<string>(''),
    imageFileName: fb.control<string>(''),
    imageFormat: fb.control<ImageFileFormat>('raw'),
    imageOverwrite: fb.control<boolean>(false),
    imagePreallocate: fb.control<boolean>(false),
  });
};

@Component({
  selector: 'app-advanced-options-settings',
  imports: [
    ReactiveFormsModule,
    ToggleCardComponent,
    FileTreeComponent,
    OptionsListComponent,
    ShipToggle,
    ShipRadio,
    ShipButton,
    ShipIcon,
    ShipFormField,
    RouterLink,
  ],
  templateUrl: './options.component.html',
  styleUrl: './options.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class OptionsComponent {
  #restoreFlowState = inject(RestoreFlowState);
  #sysinfoState = inject(SysinfoState);
  #dialog = inject(ShipDialogService);

  optionsForm = this.#restoreFlowState.optionsForm;
  optionsFormSignal = this.#restoreFlowState.optionsFormSignal;
  isSubmitting = this.#restoreFlowState.isSubmitting;
  extendedData = this.#restoreFlowState.extendedDataType;
  advancedOptions = this.#restoreFlowState.advancedOptions;
  hasRestoreOptions = this.#sysinfoState.hasRestoreOptions;
  canRegisterRestoredItems = this.#restoreFlowState.canRegisterRestoredItems;
  /** A Sync job copies files back as they are on the destination, without backup metadata or engine options */
  isSync = computed(() => this.#restoreFlowState.backup()?.Backup?.OperationType === 'Sync');

  remoteCustomTargetUrl = signal<string | null>(null);

  /** Whether the server can restore a disk image to an image file */
  canRestoreToImageFile = computed(() =>
    this.#sysinfoState.restoreDestinationProviderModules().some((x) => x.Key === IMAGE_FILE_MODULE_KEY)
  );

  /** Whether the restore writes a disk, either a physical disk or an image file */
  isDiskTarget = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    return mode === 'diskimage' || mode === 'diskimage-file';
  });

  hiddenAdvancedOptions = [
    'restore-path',
    'overwrite',
    'restore-permissions',
    'skip-metadata',
    'register-restored-items',
    'passphrase',
    'time',
    'version',
    IMAGE_FORMAT_OPTION,
    IMAGE_PREALLOCATE_OPTION,
  ];
  backupId = computed(() => this.#restoreFlowState.backup()?.Backup?.ID ?? null);
  extendedDataType = computed(() => {
    const type = this.#restoreFlowState.extendedDataType();
    if (type === 'o365') {
      return 'o365';
    } else if (type === 'gsuite') {
      return 'gsuite';
    } else if (type === 'diskimage') {
      return 'diskimage';
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
    } else if (mode === 'diskimage') {
      return 'diskimage://';
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
    if (this.optionsFormSignal()?.restoreFrom === 'diskimage') {
      return true;
    }
    return false;
  });

  isCustomRemoteRestore = computed(() => {
    const mode = this.optionsFormSignal()?.restoreFrom;
    return mode === 'same-custom' || mode === 'other-custom';
  });

  canCheckPermissions = computed(() => {
    const type = this.extendedDataType();
    return (
      (type === 'o365' || type === 'gsuite') && this.isCustomRemoteRestore() && this.customDestinationUrl() !== null
    );
  });

  checkPermissions() {
    const url = this.customDestinationUrl();
    const type = this.extendedDataType();
    if (!url || (type !== 'o365' && type !== 'gsuite')) return;

    this.#dialog.open(CustomRemotePermissionsDialog, {
      maxWidth: '700px',
      width: '100%',
      closeOnOutsideClick: true,
      data: {
        url,
        sourcePrefix: this.remoteCustomSourcePrefix() ?? '',
        backupId: this.backupId(),
        module: type === 'o365' ? 'office365' : 'googleworkspace',
        mode: 'restore',
      },
    });
  }

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

  chooseDiskDestination() {
    return true;
  }

  /** Selects the image file target, suggesting a file name from the backed-up disk */
  chooseImageFileDestination() {
    const controls = this.optionsForm.controls;
    if (!controls.imageFileName.value?.trim()) {
      const name = defaultImageFileName(this.#restoreFlowState.backup()?.Backup?.Sources);
      controls.imageFileName.setValue(setImageExtension(name, controls.imageFormat.value ?? 'raw'));
    }
  }

  /** Gives the file name the extension of the chosen format, as the server picks the format by extension */
  setImageFormat(format: ImageFileFormat) {
    const controls = this.optionsForm.controls;
    controls.imageFormat.setValue(format);
    controls.imageFileName.setValue(setImageExtension(controls.imageFileName.value ?? '', format));
  }

  // Keep the format choice in line with an extension typed in the file name
  #syncImageFormatEffect = effect(() => {
    const name = this.optionsFormSignal()?.imageFileName ?? '';
    const format = imageFormatFromName(name);
    if (name.trim() !== '' && this.optionsForm.controls.imageFormat.value !== format) {
      this.optionsForm.controls.imageFormat.setValue(format);
    }
  });

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

  submit() {
    const files = (this.#restoreFlowState.selectFilesFormSignal()?.filesToRestore ?? '')
      .split('\0')
      .filter((x) => x !== '');
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

    const restoreToTargetDisk = this.optionsFormSignal()?.restoreFrom === 'diskimage';
    const restoreToImageFile = this.optionsFormSignal()?.restoreFrom === 'diskimage-file';

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
                : $localize`Please choose a path to restore to in the Microsoft 365 tenant.`,
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
      // The cloud restore targets require overwrite; existing items are handled by the ignore-existing option instead
      this.optionsForm.controls.handleExisting.setValue('overwrite');
      this.optionsForm.controls.includeMetadata.setValue(true);
      this.optionsForm.controls.permissions.setValue(true);
    } else if (restoreToTargetDisk) {
      let path = this.optionsFormSignal()?.restoreFromPath;

      if (!path || path.trim() === '') {
        this.#dialog.open(ConfirmDialogComponent, {
          data: {
            title: $localize`No path specified`,
            message: $localize`Please choose a target disk to restore to.`,

            confirmText: $localize`OK`,
            cancelText: undefined,
          },
        });
        return;
      }

      if (!path.startsWith('@diskimage://')) {
        path = `@diskimage://${path}`;
      }

      this.#restoreFlowState.setAlternateRestorePath(path, null);
      this.optionsForm.controls.includeMetadata.setValue(true);
      this.optionsForm.controls.permissions.setValue(true);
    } else if (restoreToImageFile) {
      const value = this.optionsFormSignal();
      const result = buildImageFileRestorePath(value?.imageFolder, value?.imageFileName, !!value?.imagePreallocate);

      if ('error' in result) {
        const messages = {
          'missing-folder': $localize`Please choose the folder to write the image file to.`,
          'missing-name': $localize`Please enter a name for the image file.`,
          'invalid-name': $localize`The image file name cannot contain a folder separator. Choose the folder in the folder list.`,
          'invalid-path': $localize`The image file path cannot contain the characters ? or #.`,
        };

        this.#dialog.open(ConfirmDialogComponent, {
          data: {
            title: $localize`No image file specified`,
            message: messages[result.error],
            confirmText: $localize`OK`,
            cancelText: undefined,
          },
        });
        return;
      }

      // An existing image file is only replaced when allowed
      this.optionsForm.controls.handleExisting.setValue(value?.imageOverwrite ? 'overwrite' : 'saveTimestamp');
      this.#restoreFlowState.setAlternateRestorePath(result.path, null);
      this.optionsForm.controls.includeMetadata.setValue(true);
      this.optionsForm.controls.permissions.setValue(true);
    } else {
      this.#restoreFlowState.setAlternateRestorePath(null, null);
    }

    this.#restoreFlowState.submit();
  }
}
