import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { FormBuilder, FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleAlertComponent,
  SparkleDialogComponent,
  SparkleDialogService,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
  SparkleTooltipComponent,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { BackupState } from '../../backup/backup.state';
import { DESTINATION_CONFIG } from '../../backup/destination/destination.config';
import { FormView, toTargetPath } from '../../backup/destination/destination.config-utilities';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../core/components/size/size.component';
import { TimespanComponent } from '../../core/components/timespan/timespan.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { DuplicatiServerService, IDynamicModule } from '../../core/openapi';
import { RestoreFlowState } from '../restore-flow.state';

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
  selector: 'app-restore-destination',
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    SparkleFormFieldComponent,
    SparkleMenuComponent,
    SparkleIconComponent,
    SparkleToggleComponent,
    SparkleTooltipComponent,
    SparkleDialogComponent,
    SparkleAlertComponent,
    SparkleSelectComponent,
    SparkleProgressBarComponent,
    TimespanComponent,
    SizeComponent,
    ToggleCardComponent,
    FileTreeComponent,
  ],
  templateUrl: './restore-destination.component.html',
  styleUrl: './restore-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [BackupState],
})
export default class RestoreDestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #httpClient = inject(HttpClient);
  #backupState = inject(BackupState);
  #dupServer = inject(DuplicatiServerService);
  #dialog = inject(SparkleDialogService);
  #restoreFlowState = inject(RestoreFlowState);
  injector = inject(Injector);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  destinationForm = this.#backupState.destinationForm;
  destinationFormPair = this.#backupState.destinationFormPair;
  selectedAdvancedFormPair = this.#backupState.selectedAdvancedFormPair;
  notSelectedAdvancedFormPair = this.#backupState.notSelectedAdvancedFormPair;
  selectedHttpOptions = this.#backupState.selectedHttpOptions;
  notSelectedHttpOptions = this.#backupState.notSelectedHttpOptions;
  destinationOptions = this.#backupState.destinationOptions;
  destinationFormSignal = this.#backupState.destinationFormSignal;
  destinationCount = computed(() => this.destinationFormSignal()?.destinations?.length ?? 0);
  successfulTest = signal(false);
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

  destinationTypeOptionsNotFocused = computed(() => {
    const focused = this.destinationTypeOptionsInFocus();
    const options = this.destinationTypeOptions();

    return options.filter((x) => !focused.includes(x.key)!);
  });

  targetUrlEffect = effect(() => {
    this.destinationFormSignal();

    if (this.destinationForm.valid) {
      const targetUrl = this.#backupState.getCurrentTargetUrl();
      this.#restoreFlowState.updateTargetUrl(targetUrl[0]);
    } else {
      this.#restoreFlowState.updateTargetUrl(null);
    }
  });

  ngOnInit() {
    const currentTargetUrl = this.#restoreFlowState.destinationTargetUrl();

    if (currentTargetUrl) {
      this.#backupState.updateFieldsFromTargetUrl(currentTargetUrl);
    }
  }

  getFormFieldValue(
    destinationIndex: number,
    formGroupName: 'custom' | 'dynamic' | 'advanced',
    formControlName: string
  ) {
    const dest = this.destinationForm.controls.destinations.controls?.[destinationIndex];
    const group = dest.controls?.[formGroupName];

    return group.controls[formControlName].value;
  }

  addDestinationFormGroup(key: IDynamicModule['Key']) {
    this.#backupState.addDestinationFormGroup(key);
  }

  addAdvancedFormPair(item: FormView, formArrayIndex: number) {
    this.#backupState.addAdvancedFormPair(item, formArrayIndex);
  }

  removeFormView(item: FormView, formArrayIndex: number) {
    this.#backupState.removeAdvancedFormPair(item, formArrayIndex);
  }

  addHttpOption(item: FormView, formArrayIndex: number) {
    this.#backupState.addHttpOption(item, formArrayIndex);
  }

  targetUrlCtrl = new FormControl();
  targetUrlInitial = signal<string | null>(null);
  targetUrlDialogOpen = signal(false);

  openTargetUrlDialog() {
    const targetUrls = this.#backupState.getCurrentTargetUrl();
    const targetUrl = targetUrls[0];
    this.targetUrlCtrl.setValue(targetUrl);
    this.targetUrlInitial.set(targetUrl);
    this.targetUrlDialogOpen.set(true);
  }

  closeTargetUrlDialog(submit = false) {
    this.targetUrlDialogOpen.set(false);

    const targetUrl = this.targetUrlCtrl.value;
    const initialTargetUrl = this.targetUrlInitial();

    if (!submit || targetUrl === initialTargetUrl) return;

    this.#backupState.updateFieldsFromTargetUrl(this.targetUrlCtrl.value);
  }

  testDestination(destinationIndex = 0) {
    const targetUrls = this.#backupState.getCurrentTargetUrl();
    const targetUrl = targetUrls[destinationIndex];

    if (!targetUrl) return;

    this.#dupServer
      .postApiV1RemoteoperationTest({
        requestBody: {
          path: targetUrl,
        },
      })
      .subscribe({
        next: () => {
          this.successfulTest.set(true);

          setTimeout(() => {
            this.successfulTest.set(false);
          }, 3000);
        },
        error: (err) => {
          const errorMessage = err.error.error.Error;

          // TODO: This is duplicated in destination.component.ts
          if (errorMessage === 'missing-folder') {
            this.#dialog.open(ConfirmDialogComponent, {
              data: {
                title: $localize`Create folder`,
                message: $localize`The remote destination folder does not exist, do you want to create it?`,
                confirmText: $localize`Create folder`,
                cancelText: $localize`Cancel`,
              },
              closed: (res) => {
                if (!res) return;

                this.#dupServer
                  .postApiV1RemoteoperationCreate({
                    requestBody: {
                      path: targetUrl,
                    },
                  })
                  .subscribe({
                    next: () => {
                      this.#dialog.open(ConfirmDialogComponent, {
                        data: {
                          title: $localize`Folder created`,
                          message: $localize`The remote destination folder was created successfully.`,
                          confirmText: $localize`OK`,
                          cancelText: null,
                        },
                        closed: () => {
                          this.testDestination(destinationIndex);
                        },
                      });
                    }
                  });
              },
            });
          }

          if (errorMessage.startsWith('incorrect-cert:')) {
            const certData = errorMessage.split('incorrect-cert:')[1];

            this.#dialog.open(ConfirmDialogComponent, {
              maxWidth: '500px',
              data: {
                title: $localize`Trust the certificate`,
                message: $localize`The server is using a certificate that is not trusted.
          If this is a self-signed certificate, you can choose to trust this certificate.
          The server reported the certificate hash: ${certData}`,
                confirmText: $localize`Trust the certificate`,
                cancelText: $localize`Cancel`,
              },
              closed: (res: boolean) => {
                if (!res) return;

                this.#backupState.addHttpOptionByName('accept-specified-ssl-hash', certData);
              },
            });
          }

          if (errorMessage.startsWith('incorrect-host-key:')) {
            const reportedhostkey = errorMessage.split('incorrect-host-key:"')[1].split('",')[0];
            const suppliedhostkey = errorMessage.split('accepted-host-key:"')[1].split('",')[0];

            if (!suppliedhostkey) {
              this.#dialog.open(ConfirmDialogComponent, {
                maxWidth: '500px',
                data: {
                  title: $localize`Approve host key?`,
                  message: $localize`No certificate was specified, please verify that the reported host key is correct: ${reportedhostkey}`,
                  confirmText: $localize`Approve`,
                  cancelText: $localize`Cancel`,
                },
                closed: (res) => {
                  if (!res) return;

                  this.#backupState.addAdvancedFormPairByName('ssh-fingerprint', destinationIndex, reportedhostkey);
                },
              });
            } else {
              // MITM dialog
              this.#dialog.open(ConfirmDialogComponent, {
                maxWidth: '500px',
                data: {
                  title: $localize`The host key has changed`,
                  message: $localize`The host key has changed, please check with the server administrator if this is correct,
otherwise you could be the victim of a MAN-IN-THE-MIDDLE attack.
Do you want to REPLACE your CURRENT host key ${suppliedhostkey}
with the REPORTED host key: ${reportedhostkey}?`,
                  confirmText: $localize`Approve`,
                  cancelText: $localize`Cancel`,
                },
                closed: (res) => {
                  if (!res) return;

                  this.#backupState.addAdvancedFormPairByName('ssh-fingerprint', destinationIndex, reportedhostkey);
                },
              });
            }
          }
        },
      });
  }

  mapToTargetUrl(destinationGroup: DestinationFormGroup) {
    return toTargetPath(destinationGroup.value);
  }

  removeDestinationFormGroup(index: number) {
    this.destinationForm.controls.destinations.removeAt(index);
  }

  displayFn(key: IDynamicModule['Key']) {
    const item = this.destinationOptions().find((x) => x.Key === key);

    return item ? `${item.DisplayName}` : '';
  }

  goBack() {
    this.#restoreFlowState.exit();
  }

  next() {
    this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
  }

  #oauthServiceLink = signal('https://duplicati-oauth-handler.appspot.com/').asReadonly();
  #oauthCreateToken = signal(
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  ).asReadonly();
  #oauthInProgress = signal(false);
  #oauthId = signal(null);

  keyCreation() {}

  oauthStartTokenCreation(backendKey: string) {
    // if (!servicelink.endsWith('/')) servicelink += '/';

    this.#oauthInProgress.set(true);

    const w = 450;
    const h = 600;
    const startlink = this.#oauthServiceLink() + '?type=' + backendKey + '&token=' + this.#oauthCreateToken();

    // const countDown = 100;
    // const ft = oauthCreateToken;
    const left = screen.width / 2 - w / 2;
    const top = screen.height / 2 - h / 2;
    const wnd = window.open(
      startlink,
      '_blank',
      'height=' + h + ',width=' + w + ',menubar=0,status=0,titlebar=0,toolbar=0,left=' + left + ',top=' + top
    );

    wnd?.addEventListener('blur', (event) => {
      console.log('event blur', event);
    });

    wnd?.addEventListener('beforeunload', (event) => {
      console.log('event beforeunload', event);
      this.#httpClient
        .get(this.#oauthServiceLink() + 'fetch?callback=JSON_CALLBACK', {
          params: { token: this.#oauthCreateToken() },
        })
        .pipe(finalize(() => this.#oauthInProgress.set(false)))
        .subscribe({
          next: (res: any) => {
            console.log('res', res);

            if (res?.authid) {
              this.#oauthId.set(res.authid);

              // wnd.close();
            }
          },
        });
    });

    // var recheck = function () {
    //   countDown--;
    //   if (countDown > 0 && ft == oauthCreateToken) {
    //     $http
    //       .jsonp(servicelink + "fetch?callback=JSON_CALLBACK", {
    //         params: { token: ft },
    //       })
    //       .then(
    //         function (response) {
    //           if (response.data.authid) {
    //             const AuthID = response.data.authid;
    //             const oauth_in_progress = false;
    //             wnd.close();
    //           } else {
    //             setTimeout(recheck, 3000);
    //           }
    //         },
    //         function (response) {
    //           setTimeout(recheck, 3000);
    //         }
    //       );
    //   } else {
    //     const oauth_in_progress = false;
    //     if (wnd != null) wnd.close();
    //   }
    // };

    // setTimeout(recheck, 6000);

    // return false;
  }
}
