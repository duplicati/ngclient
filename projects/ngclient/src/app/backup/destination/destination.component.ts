import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import { FormBuilder, FormGroup, FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipAlert, ShipButton, ShipDialog, ShipDialogService, ShipFormField, ShipIcon, ShipMenu } from '@ship-ui/core';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../core/openapi';
import { TestDestinationService } from '../../core/services/test-destination.service';
import { DestinationTypeOption } from '../../core/states/destinationconfig.state';
import { BackupState } from '../backup.state';
import { DestinationListItemComponent } from './destination-list-item/destination-list-item.component';
import { DestinationListComponent } from './destination-list/destination-list.component';
import { getConfigurationByKey, getConfigurationByUrl } from './destination.config-utilities';
import { SingleDestinationComponent } from './single-destination/single-destination.component';

const fb = new FormBuilder();

export const createDestinationForm = (
  defaults = {
    destinations: [],
  }
) => {
  return fb.group({
    destinations: fb.array<DestinationFormGroup>(defaults.destinations),
  });
};

export const createDestinationFormGroup = ({
  key,
  customGroup,
  dynamicGroup,
  advancedGroup,
}: {
  key: string;
  customGroup: FormGroup;
  dynamicGroup: FormGroup;
  advancedGroup: FormGroup;
}) => {
  return fb.group({
    destinationType: fb.control<string>(key),
    custom: customGroup,
    dynamic: dynamicGroup,
    advanced: advancedGroup,
  });
};

export type DestinationFormGroup = ReturnType<typeof createDestinationFormGroup>;
export type DestinationFormGroupValue = ReturnType<typeof createDestinationFormGroup>['value'];

@Component({
  selector: 'app-destination',
  imports: [
    SingleDestinationComponent,
    DestinationListComponent,
    DestinationListItemComponent,

    FormsModule,
    ShipButton,
    ShipFormField,
    ShipMenu,
    ShipIcon,
    ShipDialog,
    ShipAlert,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);
  #dialog = inject(ShipDialogService);
  #testDestination = inject(TestDestinationService);
  injector = inject(Injector);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  targetUrlModel = this.#backupState.targetUrlModel;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  toggleNewDestination = signal(true);

  testSignal = this.#backupState.testSignal;
  testErrorMessage = this.#backupState.testErrorMessage;

  selectedDestinationType = computed(() => {
    const targetUrl = this.targetUrlModel();

    if (!targetUrl) return null;

    return getConfigurationByUrl(targetUrl) ?? null;
  });

  selectedDestinationTypeOption = computed(() => {
    const x = this.selectedDestinationType();
    return x
      ? ({
          key: x.customKey ?? x.key,
          customKey: x.customKey ?? null,
          displayName: x.displayName,
          description: x.description,
          icon: x.icon,
        } as DestinationTypeOption)
      : null;
  });

  copyTargetUrl() {
    navigator.clipboard.writeText(this.targetUrlModel() ?? '');
  }

  openTargetUrlDialog() {
    const targetUrl = this.targetUrlModel();
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    this.#backupState.setTargetUrl(targetUrl);
  }

  testDestination(destinationIndex: number, suppressErrorDialogs: boolean, callback?: () => void) {
    const targetUrl = this.targetUrlModel();

    if (!targetUrl) return;

    this.#backupState.setTestState('testing');

    this.#testDestination
      .testDestination(targetUrl, this.#backupState.backupId(), destinationIndex, true, 'Backend', true)
      .subscribe({
        next: (res) => {
          if (res.action === 'success') {
            this.#backupState.setTestState('success');

            if (this.#backupState.isNew()) {
              if (res.containsBackup === true) {
                this.#backupState.setTestState(
                  'warning',
                  $localize`The remote destination already contains a backup. Please use a different folder for each backup.`
                );
                if (!suppressErrorDialogs) {
                  this.#dialog.open(ConfirmDialogComponent, {
                    data: {
                      title: $localize`Folder contains backup`,
                      message: $localize`The remote destination already contains a backup. You must use a different folder for each backup.`,
                      confirmText: $localize`OK`,
                      cancelText: undefined,
                    },
                  });
                }
              } else if (res.anyFilesFound === true) {
                this.#backupState.setTestState('warning', $localize`The remote destination contains unknown files.`);
                if (!suppressErrorDialogs) {
                  this.#dialog.open(ConfirmDialogComponent, {
                    data: {
                      title: $localize`Folder is not empty`,
                      message: $localize`The remote destination is not empty. It is recommended to use an empty folder for the backup.`,
                      confirmText: $localize`OK`,
                      cancelText: undefined,
                    },
                  });
                }
              }
            }

            callback?.();
            return;
          }

          this.#backupState.setTestState(
            'error',
            res.errorMessage ?? $localize`An error occurred while testing the destination.`
          );

          if (res.action === 'generic-error') {
            callback?.();
            return;
          }

          const targetUrlHasParams = targetUrl.includes('?');
          if (res.action === 'trust-cert') {
            this.#backupState.setTargetUrl(
              targetUrl + `${targetUrlHasParams ? '&' : '?'}accept-specified-ssl-hash=${res.certData}`
            );
          }

          if (res.action === 'approve-host-key') {
            this.#backupState.setTargetUrl(
              targetUrl + `${targetUrlHasParams ? '&' : '?'}ssh-fingerprint=${res.reportedHostKey}`
            );
          }

          if (res.testAgain) this.testDestination(res.destinationIndex, suppressErrorDialogs);
          else callback?.();
        },
      });
  }

  setDestination(key: IDynamicModule['Key']) {
    const config = getConfigurationByKey(key ?? '');
    if (!config) return;

    if (config.mapper.default) {
      const defaultUrl = config.mapper.default(this.#backupState.backupName() ?? '');
      this.#backupState.setTargetUrl(defaultUrl, true);
      return;
    }

    this.#backupState.setTargetUrl(`${key}://`, true);
  }

  removeDestination() {
    this.#backupState.setTargetUrl(null, true);
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    const isNew = this.#backupState.isNew();
    const testSignalValue = this.testSignal();

    if (!isNew) {
      this.#navigateToNext();
      return;
    }

    if (testSignalValue === '') {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`You have not tested the destination yet. Do you want to test it now?`,
          confirmText: $localize`Test now`,
          cancelText: $localize`Skip test and continue`,
        },
        closed: (res) => {
          if (res) {
            this.testDestination(0, false, () => {
              if (this.testSignal() === 'success') {
                this.#navigateToNext();
              } else {
                this.#dialog.open(ConfirmDialogComponent, {
                  data: {
                    title: $localize`Test did not succeed`,
                    message: this.testErrorMessage() ?? $localize`Failed to test the destination.`,
                    confirmText: $localize`OK`,
                    cancelText: undefined,
                  },
                });
              }
            });
          } else {
            this.#navigateToNext();
          }
        },
      });
      return;
    }

    if (testSignalValue !== 'success') {
      this.#dialog.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Test destination`,
          message: $localize`The destination has not been tested successfully. Are you sure you want to continue?`,
          confirmText: $localize`Yes, continue`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (res) this.#navigateToNext();
        },
      });

      return;
    }

    this.#navigateToNext();
  }

  #navigateToNext() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }
}
