import { NgTemplateOutlet } from '@angular/common';
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
  SparkleTooltipDirective,
} from '@sparkle-ui/core';
import { finalize } from 'rxjs';
import { ConfirmDialogComponent } from '../../core/components/confirm-dialog/confirm-dialog.component';
import { FileDropTextareaComponent } from '../../core/components/file-drop-textarea/file-drop-textarea.component';
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

type DefaultGroup = {
  destinationType: string;
  oauthField?: string;
  index: number;
  formGroupName: 'custom' | 'dynamic' | 'advanced';
  formView: FormView;
};

@Component({
  selector: 'app-destination',
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    SparkleFormFieldComponent,
    SparkleMenuComponent,
    SparkleIconComponent,
    SparkleToggleComponent,
    SparkleDialogComponent,
    SparkleAlertComponent,
    SparkleSelectComponent,
    SparkleTooltipDirective,
    SparkleProgressBarComponent,
    TimespanComponent,
    ToggleCardComponent,
    FileTreeComponent,
    FileDropTextareaComponent,
    SizeComponent,
  ],
  templateUrl: './destination.component.html',
  styleUrl: './destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class DestinationComponent {
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #backupState = inject(BackupState);
  #dialog = inject(SparkleDialogService);
  #testDestination = inject(TestDestinationService);
  injector = inject(Injector);

  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');

  destinationForm = this.#backupState.destinationForm;
  destinationFormPair = this.#backupState.destinationFormPair;
  selectedAdvancedFormPair = this.#backupState.selectedAdvancedFormPair;
  notSelectedAdvancedFormPair = this.#backupState.notSelectedAdvancedFormPair;
  destinationOptions = this.#backupState.destinationOptions;
  destinationFormSignal = this.#backupState.destinationFormSignal;
  destinationCount = computed(() => this.destinationFormSignal()?.destinations?.length ?? 0);
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
    const destinationFormSignal = this.destinationFormSignal();
    const options = this.destinationTypeOptions();

    return options.find((x) => destinationFormSignal?.destinations?.[0]?.destinationType === x.key);
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

  hasDoubleLeadingSlashes(str: string) {
    return str.startsWith('//');
  }

  getFormControl(destinationIndex: number, formGroupName: 'custom' | 'dynamic' | 'advanced', formControlName: string) {
    const dest = this.destinationForm.controls.destinations.controls?.[destinationIndex];
    const group = dest.controls?.[formGroupName];

    return group.controls[formControlName];
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

          if (res.action === 'trust-cert')
            this.#backupState.addOrUpdateAdvancedFormPairByName('accept-specified-ssl-hash', res.destinationIndex, res.certData);
          if (res.action === 'approve-host-key')
            this.#backupState.addOrUpdateAdvancedFormPairByName(
              'ssh-fingerprint',
              res.destinationIndex,
              res.reportedHostKey
            );
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
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['source-data'], { relativeTo: this.#route.parent });
  }

  #oauthCreateToken = signal(
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  ).asReadonly();
  #oauthInProgress = signal(false);
  #oauthId = signal(null);

  keyCreation() {}

  oauthStartTokenCreation(backendKey: string, item: DefaultGroup) {
    const control = this.getFormControl(item.index, item.formGroupName, item.formView.name);
    const link = backendKey == 'pcloud' 
      ? this.#backupState.oauthServiceLinkNew
      : this.#backupState.oauthServiceLink;

    this.#oauthInProgress.set(true);

    const oauthCreateToken = this.#oauthCreateToken();
    const w = 450;
    const h = 600;
    const startlink = link + '?type=' + backendKey + '&token=' + oauthCreateToken;

    const left = screen.width / 2 - w / 2;
    const top = screen.height / 2 - h / 2;
    const wnd = window.open(
      startlink,
      '_blank',
      'height=' + h + ',width=' + w + ',menubar=0,status=0,titlebar=0,toolbar=0,left=' + left + ',top=' + top
    );

    window.addEventListener('message', (event) => {
      const hasAuthId = event.data.startsWith('authid:');
      const authId = hasAuthId ? event.data.replace('authid:', '') : null;

      if (hasAuthId) {
        // this.#oauthId.set(authId);
        control.setValue(authId);
        this.#oauthInProgress.set(false);

        wnd?.close();
      } else {
        // TODO some error handling
      }
    });

    return false;
  }
}
