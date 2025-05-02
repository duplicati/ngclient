import { NgTemplateOutlet } from '@angular/common';
import { HttpClient } from '@angular/common/http';
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
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../core/components/size/size.component';
import { TimespanComponent } from '../../core/components/timespan/timespan.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { IDynamicModule } from '../../core/openapi';
import { TestDestinationService } from '../../core/services/test-destination.service';
import { BackupState } from '../backup.state';
import { DESTINATION_CONFIG } from './destination.config';
import { FormView, toTargetPath } from './destination.config-utilities';

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
    ToggleCardComponent,
    FileTreeComponent,
    SizeComponent,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #httpClient = inject(HttpClient);
  #backupState = inject(BackupState);
  #dialog = inject(SparkleDialogService);
  #testDestination = inject(TestDestinationService);
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

  targetUrl = computed(() => {
    const targetUrls = this.#backupState.getCurrentTargetUrl();
    const targetUrl = targetUrls[0];

    return targetUrl;
  });

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

    this.#testDestination.testDestination(targetUrl, destinationIndex, true).subscribe({
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

        if (res.action === 'trust-cert')
          this.#backupState.addHttpOptionByName('accept-specified-ssl-hash', res.destinationIndex, res.certData);
        if (res.action === 'approve-host-key')
          this.#backupState.addHttpOptionByName('accept-specified-host-key', res.destinationIndex, res.reportedHostKey);
        if (res.testAgain) this.testDestination(res.destinationIndex);
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
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
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
