import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, Injector, input, model, signal } from '@angular/core';
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
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { BackupState } from '../../backup.state';
import { CustomFormView, FormView, fromTargetPath, getConfigurationByKey, toTargetPath } from '../destination.config-utilities';

type DestinationConfig = {
  destinationType: string;
  oauthField: string | null;
  custom: FormView[];
  dynamic: FormView[];
  advanced: FormView[];
};
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
  ],
  templateUrl: './single-destination.component.html',
  styleUrl: './single-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SingleDestinationComponent {
  #backupState = inject(BackupState);
  #sysinfo = inject(SysinfoState);
  #serverSettings = inject(ServerSettingsService);
  #destinationState = inject(DestinationConfigState);
  injector = inject(Injector);
  targetUrl = model.required<string | null>();
  useBackupState = input(false);

  #destType: string | null = null;
  destinationType = computed(() => {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return null;

    const destType = targetUrl.split('://')[0];

    this.#destType = destType;

    return destType;
  });

  destinationForm = signal({
    custom: {} as Record<string, any>,
    dynamic: {} as Record<string, any>,
    advanced: {} as Record<string, any>,
  });

  advancedFormFieldNames = computed(() => Object.keys(this.destinationForm().advanced));
  destinationFormConfig = signal<DestinationConfig | null>(null);

  nonSelectedAdvancedFormViews = computed(() => {
    const config = this.destinationFormConfig();

    if (!config) return [];

    const advancedFormFieldNames = this.advancedFormFieldNames();

    return config.advanced.filter(
      (x) => advancedFormFieldNames.findIndex((optionName) => optionName === x.name) === -1
    );
  });

  destinationTypeEffect = effect(() => {
    const key = this.destinationType() ?? '';

    const destinationConfig = getConfigurationByKey(key);
    const _key = destinationConfig?.key;
    const item = this.#destinationState.backendModules().find((x) => x.Key === _key) ?? {
      Key: key,
      DisplayName: key,
      Description: getConfigurationByKey(key).description,
      Options: [],
    };

    if (!item || !item.Options || !key) return;

    const oauthField = destinationConfig && destinationConfig.oauthField ? destinationConfig.oauthField : null;
    const customFields = destinationConfig && destinationConfig.customFields ? destinationConfig.customFields : {};
    const dynamicFields = destinationConfig && destinationConfig.dynamicFields ? destinationConfig.dynamicFields : [];
    const advancedFields =
      destinationConfig && destinationConfig.advancedFields ? destinationConfig.advancedFields : [];
    const ignoredAdvancedFields =
      destinationConfig && destinationConfig.ignoredAdvancedFields ? destinationConfig.ignoredAdvancedFields : [];

    const destinationFormConfig = {
      destinationType: key,
      oauthField,
      custom: [] as FormView[],
      dynamic: [] as FormView[],
      advanced: [] as FormView[],
    } as DestinationConfig;

    if (customFields) {
      Object.entries(customFields).forEach(([key, value], index) => {
        destinationFormConfig.custom.push({ order: 900 + index, ...value });
      });
    }

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

        destinationFormConfig.advanced.push(patchedNewField);
      }
    }

    destinationFormConfig.custom.sort((a, b) => a.order! - b.order!);
    destinationFormConfig.dynamic.sort((a, b) => a.order! - b.order!);
    destinationFormConfig.advanced.sort((a, b) => a.order! - b.order!);

    this.destinationFormConfig.set(destinationFormConfig);
  });

  targetUrlEffect = effect(() => {
    const config = this.destinationFormConfig();

    if (!config) return;

    const targetUrl = this.targetUrl();

    if (!targetUrl) return;

    const targetUrlData = fromTargetPath(targetUrl);

    if (!targetUrlData) return;

    const formValues = {
      custom: targetUrlData.custom,
      dynamic: targetUrlData.dynamic,
      advanced: targetUrlData.advanced,
    };

    this.destinationForm.update((y) => {
      y.custom = { ...y.custom, ...formValues.custom };
      y.dynamic = { ...y.dynamic, ...formValues.dynamic };
      y.advanced = { ...y.advanced, ...formValues.advanced };

      return y;
    });
  });

  destinationFormEffect = effect(() => {
    const key = this.#destType;
    const form = this.destinationForm();

    if (!form || !key) return;

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
    const formView = form?.[fieldGroup].find((y) => y.name === fieldName);

    if (!formView) return null;

    return formView;
  }

  getDefaultFormView(optionName: string) {
    return {
      name: optionName,
      type: 'String',
      shortDescription: optionName,
      longDescription: $localize`This is an undocumented option.`,
    };
  }

  getFieldGroup(form: any, fieldGroup: string) {
    return form[fieldGroup];
  }

  hasDoubleLeadingSlashes(str?: string | null) {
    return str?.startsWith('//') ?? false;
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

  #oauthInProgress = signal(false);

  oauthStartTokenCreation(backendKey: string, fieldGroup: 'custom' | 'dynamic' | 'advanced', fieldName: string, usev2?: number | null) {
    this.#oauthInProgress.set(true);

    let oauthUrl = (usev2 ?? 1) == 2
      ? this.#sysinfo.defaultOAuthUrlV2()
      : this.#sysinfo.defaultOAuthUrl();

    const serverOverride = this.#serverSettings.serverSettings()?.['--oauth-url'];
    if (serverOverride && serverOverride.length > 0)
      oauthUrl = serverOverride;

    if (this.useBackupState()) {
      const backupServerOverride = this.#backupState.mapFormsToSettings().find((x) => x.Name === '--oauth-url')?.Value;
      if (backupServerOverride && backupServerOverride.length > 0)
        oauthUrl = backupServerOverride;      
    }

    const formOverride = this.destinationForm().advanced["oauth-url"];
    if (formOverride && formOverride.length > 0)
      oauthUrl = formOverride;
    
    const startlink = `${oauthUrl}?type=${backendKey}`;
    
    const w = 450;
    const h = 600;
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
