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
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleAlertComponent,
  SparkleDialogComponent,
  SparkleDialogService,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
} from '@sparkle-ui/core';
import { BackupState } from '../../backup/backup.state';
import { getConfigurationByKey } from '../../backup/destination/destination.config-utilities';
import { SingleDestinationComponent } from '../../backup/destination/single-destination/single-destination.component';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../core/openapi';
import { TestDestinationService } from '../../core/services/test-destination.service';
import { DestinationConfigState } from '../../core/states/destinationconfig.state';
import { RestoreFlowState } from '../restore-flow.state';

@Component({
  selector: 'app-restore-destination',
  imports: [
    SingleDestinationComponent,

    FormsModule,
    SparkleFormFieldComponent,
    SparkleMenuComponent,
    SparkleIconComponent,
    SparkleDialogComponent,
    SparkleAlertComponent,
  ],
  templateUrl: './restore-destination.component.html',
  styleUrl: './restore-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class RestoreDestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #dialog = inject(SparkleDialogService);
  #testDestination = inject(TestDestinationService);
  injector = inject(Injector);
  #restoreFlowState = inject(RestoreFlowState);
  #destinationState = inject(DestinationConfigState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  targetUrlModel = this.#restoreFlowState.destinationTargetUrl;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  toggleNewDestination = signal(true);

  testSignal = this.#restoreFlowState.testSignal;
  testErrorMessage = this.#restoreFlowState.testErrorMessage;

  destinationTypeOptionsInFocus = signal(['file', 'ssh', 's3', 'gcs', 'googledrive', 'azure']);
  destinationTypeOptions = this.#destinationState.destinationTypeOptions;
  destinationTypeOptionsFocused = computed(() => {
    const focused = this.destinationTypeOptionsInFocus();
    const options = this.destinationTypeOptions();

    return focused.map((x) => options.find((y) => y.key === x)!);
  });
  selectedDestinationType = computed(() => {
    const targetUrl = this.#restoreFlowState.destinationTargetUrl();

    if (!targetUrl) return null;

    const destinationType = targetUrl.split('://')[0];

    return getConfigurationByKey(destinationType);
  });

  copyTargetUrl() {
    navigator.clipboard.writeText(this.#restoreFlowState.destinationTargetUrl() ?? '');
  }
  
  openTargetUrlDialog() {
    const targetUrl = this.#restoreFlowState.destinationTargetUrl();
    this.targetUrlCtrl.set(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl();
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl || !targetUrl) return;

    this.#restoreFlowState.updateTargetUrl(targetUrl);
  }

  testDestination(destinationIndex: number, suppressDialogs: boolean, callback?: () => void) {
    const targetUrl = this.#restoreFlowState.destinationTargetUrl();

    if (!targetUrl) return;

    this.#restoreFlowState.setTestState('testing');
    this.#testDestination.testDestination(targetUrl, destinationIndex, true, suppressDialogs).subscribe({
      next: (res) => {
        if (res.action === 'success') {
          this.#restoreFlowState.setTestState('success');
          if (res.containsBackup === false) {
            this.#restoreFlowState.setTestState(
              'warning',
              $localize`The remote destination does not contain any backups. Please check if the destination details are correct.`
            );
            if (!suppressDialogs) {
              this.#dialog.open(ConfirmDialogComponent, {
                data: {
                  title: $localize`Folder contains no backup`,
                  message: $localize`The remote destination does not contain any backups. Please check if the destination details are correct.`,
                  confirmText: $localize`OK`,
                  cancelText: undefined,
                },
              });
            }
          } else if (res.anyFilesFound === false) {
            this.#restoreFlowState.setTestState(
              'warning',
              $localize`The remote destination is empty. Please check if the destination details are correct.`
            );
            if (!suppressDialogs) {
              this.#dialog.open(ConfirmDialogComponent, {
                data: {
                  title: $localize`Folder is empty`,
                  message: $localize`The remote destination is empty. Please check if the destination details are correct.`,
                  confirmText: $localize`OK`,
                  cancelText: undefined,
                },
              });
            }
          }

          callback?.();
          return;
        }

        this.#restoreFlowState.setTestState(
          'error',
          res.errorMessage ?? $localize`An error occurred while testing the destination.`
        );

        if (res.action === 'generic-error') {
          callback?.();
          return;
        }

        const targetUrlHasParams = targetUrl.includes('?');
        if (res.action === 'trust-cert') {
          this.#restoreFlowState.updateTargetUrl(
            targetUrl + `${targetUrlHasParams ? '&' : '?'}accept-specified-ssl-hash=${res.certData}`
          );
        }

        if (res.action === 'approve-host-key') {
          this.#restoreFlowState.updateTargetUrl(
            targetUrl + `${targetUrlHasParams ? '&' : '?'}ssh-fingerprint=${res.reportedHostKey}`
          );
        }

        if (res.testAgain) this.testDestination(res.destinationIndex, suppressDialogs);
        else callback?.();
      },
    });
  }

  setDestination(key: IDynamicModule['Key']) {
    this.#restoreFlowState.updateTargetUrl(`${key}://`);
  }

  removeDestination() {
    this.#restoreFlowState.updateTargetUrl(null);
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    const testSignalValue = this.testSignal();
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
    this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
  }
}
