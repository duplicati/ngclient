import { JsonPipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, Injector, model, signal } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleMenuComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
  SparkleToggleCardComponent,
  SparkleToggleComponent,
  SparkleTooltipDirective,
} from '@sparkle-ui/core';
import { FileDropTextareaComponent } from '../../../core/components/file-drop-textarea/file-drop-textarea.component';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../../core/components/size/size.component';
import { TimespanComponent } from '../../../core/components/timespan/timespan.component';
import { ArgumentType, ICommandLineArgument } from '../../../core/openapi';
import { BackupState } from '../../backup.state';
import { DESTINATION_CONFIG } from '../destination.config';
import { CustomFormView, FormView, fromTargetPath, toTargetPath } from '../destination.config-utilities';

@Component({
  selector: 'app-single-destination',
  imports: [
    ReactiveFormsModule,
    FormsModule,
    NgTemplateOutlet,

    FileTreeComponent,
    SizeComponent,
    TimespanComponent,
    FileDropTextareaComponent,

    SparkleFormFieldComponent,
    SparkleButtonComponent,
    SparkleIconComponent,
    SparkleToggleCardComponent,
    SparkleMenuComponent,
    SparkleSelectComponent,
    SparkleTooltipDirective,
    SparkleToggleComponent,
    SparkleProgressBarComponent,

    JsonPipe,
  ],
  templateUrl: './single-destination.component.html',
  styleUrl: './single-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SingleDestinationComponent {
  #backupState = inject(BackupState);
  injector = inject(Injector);
  targetUrl = model.required<string>();

  // targetUrlData = computed(() => {
  //   console.log('targetUrl', this.targetUrl());
  //   const newTargetUrlData = fromTargetPath(this.targetUrl());
  //   return newTargetUrlData;
  // });

  destinationType = computed(() => {
    const targetUrl = this.targetUrl();

    return targetUrl.split('://')[0];
  });

  destinationForm = signal({
    custom: {} as Record<string, any>,
    dynamic: {} as Record<string, any>,
    advanced: {} as Record<string, any>,
  });

  advancedFormFieldNames = computed(() => Object.keys(this.destinationForm().advanced));

  destinationFormConfig = signal<{
    destinationType: string | null;
    oauthField: string | null;
    custom: FormView[];
    dynamic: FormView[];
    advanced: FormView[];
  }>({
    destinationType: null,
    oauthField: null,
    custom: [] as FormView[],
    dynamic: [] as FormView[],
    advanced: [] as FormView[],
  });

  nonSelectedAdvancedFormViews = computed(() => {
    const config = this.destinationFormConfig();
    const advancedFormFieldNames = this.advancedFormFieldNames();

    return config.advanced.filter(
      (x) => advancedFormFieldNames.findIndex((optionName) => optionName === x.name) === -1
    );
  });

  destinationTypeEffect = effect(() => {
    const key = this.destinationType();
    const targetUrl = this.targetUrl();
    const targetUrlData = fromTargetPath(targetUrl);

    console.log('targetUrlData', targetUrlData);

    const destinationConfig = DESTINATION_CONFIG.find((x) => x.customKey === key || x.key === key);
    const _key = destinationConfig?.key;
    const item = this.#backupState.destinationOptions().find((x) => x.Key === _key);

    if (!item || !item.Options) return;

    const oauthField = destinationConfig && destinationConfig.oauthField ? destinationConfig.oauthField : null;
    const customFields = destinationConfig && destinationConfig.customFields ? destinationConfig.customFields : {};
    const dynamicFields = destinationConfig && destinationConfig.dynamicFields ? destinationConfig.dynamicFields : [];
    const advancedFields =
      destinationConfig && destinationConfig.advancedFields ? destinationConfig.advancedFields : [];
    const ignoredAdvancedFields =
      destinationConfig && destinationConfig.ignoredAdvancedFields ? destinationConfig.ignoredAdvancedFields : [];

    const destinationFormConfig = {
      destinationType: key ?? null,
      oauthField,
      custom: [] as FormView[],
      dynamic: [] as FormView[],
      advanced: [] as FormView[],
    };

    if (customFields) {
      Object.entries(customFields).forEach(([key, value], index) => {
        const passedValue = targetUrlData?.custom?.[key];
        const inputValue = passedValue ?? value.defaultValue;

        this.destinationForm.update((y) => {
          y.custom[key] = inputValue;
          return y;
        });

        destinationFormConfig.custom.push({ order: 900 + index, ...value });
      });
    }

    // TODO - figure out why dynamic fields are getting overwritten from advanced fields only when the path are valid
    // I think it's because we can bring advanced fields to the dynamic fields but we should only if its in the config
    for (let index = 0; index < item.Options.length; index++) {
      const element = item.Options[index] as ICommandLineArgument;

      if (element.Deprecated) continue;

      const asDynamic = dynamicFields.find(
        (x) =>
          x === element.Name || element.Aliases?.includes((x as FormView).name) || (x as FormView).name === element.Name
      );

      if (asDynamic) {
        const aliasIndex = element.Aliases?.indexOf((asDynamic as FormView).name) ?? -1;
        const name = element.Aliases && aliasIndex > -1 ? element.Aliases[aliasIndex] : (element.Name as string);
        const overwriting = asDynamic && typeof asDynamic !== 'string';
        const asDynamicDefaultValue = overwriting
          ? (asDynamic?.defaultValue ?? element.DefaultValue)
          : element.DefaultValue;

        const newField = {
          name: name,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          order: 900 + index,
        };

        const patchedNewField = overwriting
          ? {
              ...newField,
              ...asDynamic,
            }
          : newField;

        const passedValue = targetUrlData?.dynamic?.[name];
        const inputValue = passedValue ?? asDynamicDefaultValue ?? element.DefaultValue;

        this.destinationForm.update((y) => {
          y.dynamic[name] = inputValue;
          return y;
        });

        destinationFormConfig.dynamic.push(patchedNewField);
      } else {
        const name = element.Name as string;
        const ignored = ignoredAdvancedFields.find((x) => x === name);

        if (ignored) continue;

        const asAdvanced = advancedFields.find((x) => x === name || (x as CustomFormView).name === name);
        const overwriting = asAdvanced && typeof asAdvanced !== 'string';
        const newField = {
          name: name as string,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          defaultValue: element.DefaultValue,
          order: 900 + index,
        };

        const patchedNewField = overwriting
          ? {
              ...newField,
              ...asAdvanced,
            }
          : newField;

        const passedValue = targetUrlData?.advanced?.[name] ?? null;

        if (passedValue) {
          this.destinationForm.update((y) => {
            y.dynamic[name] = passedValue;
            return y;
          });
        }

        destinationFormConfig.advanced.push(patchedNewField);
      }
    }

    destinationFormConfig.custom.sort((a, b) => a.order! - b.order!);
    destinationFormConfig.dynamic.sort((a, b) => a.order! - b.order!);
    destinationFormConfig.advanced.sort((a, b) => a.order! - b.order!);

    this.destinationFormConfig.set(destinationFormConfig);
  });

  destinationFormEffect = effect(() => {
    const key = this.destinationType();
    const form = this.destinationForm();
    const config = this.destinationFormConfig();

    if (!form || !config || !key) return;

    const newTargetUrl = toTargetPath({
      destinationType: key,
      custom: form.custom,
      dynamic: form.dynamic,
      advanced: form.advanced,
    });

    if (!newTargetUrl) return;

    this.targetUrl.set(newTargetUrl);
  });

  getFieldValue(fieldGroup: 'custom' | 'dynamic' | 'advanced', fieldName: string) {
    const form = this.destinationForm();
    const field = form[fieldGroup][fieldName];

    if (!field) return null;

    return field;
  }

  getFormView(fieldGroup: 'custom' | 'dynamic' | 'advanced', fieldName: string) {
    const form = this.destinationFormConfig();
    const formView = form[fieldGroup].find((y) => y.name === fieldName);

    if (!formView) return null;

    return formView;
  }

  getFieldGroup(form: any, fieldGroup: string) {
    return form[fieldGroup];
  }

  hasDoubleLeadingSlashes(str: string) {
    return str.startsWith('//');
  }

  addAdvancedOption(formView: FormView) {
    const form = this.destinationForm();

    form.advanced[formView.name] = formView.defaultValue;

    this.destinationForm.set({ ...form });
  }

  updateFieldValue(fieldGroup: 'custom' | 'dynamic' | 'advanced', fieldName: string, newValue: any) {
    const form = this.destinationForm();

    form[fieldGroup][fieldName] = newValue;

    this.destinationForm.set({ ...form });
  }

  removeAdvancedOption(fieldName: string) {
    const form = this.destinationForm();

    delete form.advanced[fieldName];

    this.destinationForm.set({ ...form });
  }

  #oauthServiceLink = signal('https://duplicati-oauth-handler.appspot.com/').asReadonly();
  #oauthCreateToken = signal(
    Math.random().toString(36).substring(2) + Math.random().toString(36).substring(2)
  ).asReadonly();
  #oauthInProgress = signal(false);

  oauthStartTokenCreation(backendKey: string, fieldGroup: 'custom' | 'dynamic' | 'advanced', fieldName: string) {
    this.#oauthInProgress.set(true);

    const oauthCreateToken = this.#oauthCreateToken();
    const w = 450;
    const h = 600;
    const startlink = this.#oauthServiceLink() + '?type=' + backendKey + '&token=' + oauthCreateToken;

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
        this.destinationForm.update((y) => {
          y[fieldGroup][fieldName] = authId;
          return y;
        });
        this.#oauthInProgress.set(false);

        wnd?.close();
      } else {
        // TODO some error handling
      }
    });

    return false;
  }
}
