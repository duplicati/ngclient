import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
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
import { finalize } from 'rxjs';
import { BackupState } from '../../backup/backup.state';
import { DESTINATION_CONFIG } from '../../backup/destination/destination.config';
import { SingleDestinationComponent } from '../../backup/destination/single-destination/single-destination.component';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { IDynamicModule } from '../../core/openapi';
import { TestDestinationService } from '../../core/services/test-destination.service';
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
  #backupState = inject(BackupState);
  #dialog = inject(SparkleDialogService);
  #testDestination = inject(TestDestinationService);
  injector = inject(Injector);
  #restoreFlowState = inject(RestoreFlowState);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  targetUrlModel = this.#backupState.targetUrlModel;
  targetUrlCtrl = signal<string | null>(null);
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);
  toggleNewDestination = signal(true);

  // Might be able to remove this and just use the RestoreFlowState targetUrl instead
  targetUrlEffect = effect(() => {
    const targetUrl = this.#backupState.targetUrlModel();

    this.#restoreFlowState.updateTargetUrl(targetUrl ?? null);
  });

  successfulTest = signal(false);
  testLoading = signal(false);
  destinationTypeOptionsInFocus = signal(['file', 'ssh', 's3', 'gcs', 'googledrive', 'azure']);
  destinationTypeOptions = signal(
    DESTINATION_CONFIG.map((x) => ({
      key: x.customKey ?? x.key,
      customKey: x.customKey ?? null,
      displayName: x.displayName,
      description: x.description,
    }))
  );
  destinationTypeOptionsFocused = computed(() => {
    const focused = this.destinationTypeOptionsInFocus();
    const options = this.destinationTypeOptions();

    return focused.map((x) => options.find((y) => y.key === x)!);
  });
  selectedDestinationType = computed(() => {
    const targetUrl = this.#backupState.targetUrlModel();

    if (!targetUrl) return null;

    const destinationType = targetUrl.split('://')[0];
    const options = this.destinationTypeOptions();

    return options.find((x) => destinationType === x.key);
  });
  destinationTypeOptionsNotFocused = computed(() => {
    const focused = this.destinationTypeOptionsInFocus();
    const options = this.destinationTypeOptions();

    return options.filter((x) => !focused.includes(x.key)!);
  });

  openTargetUrlDialog() {
    const targetUrl = this.#backupState.targetUrlModel();
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

  testDestination(destinationIndex = 0) {
    const targetUrl = this.#backupState.targetUrlModel();

    if (!targetUrl) return;

    this.testLoading.set(true);

    this.#testDestination
      .testDestination(targetUrl, destinationIndex, true)
      .pipe(finalize(() => this.testLoading.set(false)))
      .subscribe({
        next: (res) => {
          if (res.action === 'success') {
            if (this.#backupState.isNew()) {
              if (res.containsBackup === true) {
                this.#dialog.open(ConfirmDialogComponent, {
                  data: {
                    title: $localize`Folder contains backup`,
                    message: $localize`The remote destination already contains a backup. You must use a different folder for each backup.`,
                    confirmText: $localize`OK`,
                    cancelText: undefined,
                  },
                });
              } else if (res.anyFilesFound === true) {
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

            this.successfulTest.set(true);
            setTimeout(() => {
              this.successfulTest.set(false);
            }, 3000);
            return;
          }

          if (res.action === 'generic-error') {
            this.successfulTest.set(false);
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

          if (res.testAgain) this.testDestination(res.destinationIndex);
        },
      });
  }

  setDestination(key: IDynamicModule['Key']) {
    this.#backupState.setTargetUrl(`${key}://`);
  }

  removeDestination() {
    this.#backupState.setTargetUrl(null);
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
  }
}
