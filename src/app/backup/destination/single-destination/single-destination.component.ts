import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, Injector, model, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ShipButtonComponent,
  ShipFormFieldComponent,
  ShipIconComponent,
  ShipMenuComponent,
  ShipProgressBarComponent,
  ShipSelectComponent,
  ShipToggleCardComponent,
  ShipToggleComponent,
  ShipTooltipDirective,
} from '@ship-ui/core';
import { FileDropTextareaComponent } from '../../../core/components/file-drop-textarea/file-drop-textarea.component';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../../core/components/size/size.component';
import { TimespanComponent } from '../../../core/components/timespan/timespan.component';
import { ArgumentType, ICommandLineArgument } from '../../../core/openapi';

import {
  CustomFormView,
  FormView,
  fromTargetPath,
  getConfigurationByKey,
  toTargetPath,
} from '../destination.config-utilities';
import { SINGLE_DESTINATION_STATE } from './single-destination.provider';

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
    FormsModule,
    NgTemplateOutlet,

    FileTreeComponent,
    SizeComponent,
    TimespanComponent,
    FileDropTextareaComponent,

    ShipFormFieldComponent,
    ShipButtonComponent,
    ShipIconComponent,
    ShipToggleCardComponent,
    ShipMenuComponent,
    ShipSelectComponent,
    ShipTooltipDirective,
    ShipToggleComponent,
    ShipProgressBarComponent,
  ],
  templateUrl: './single-destination.component.html',
  styleUrl: './single-destination.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SingleDestinationComponent {
  #stateProvider = inject(SINGLE_DESTINATION_STATE);

  injector = inject(Injector);

  backendModules = this.#stateProvider.backendModules;
  serverSettingsOverride = this.#stateProvider.serverSettingsOverride;
  backupServerOverride = this.#stateProvider.backupServerOverride;
  oauthUrls = this.#stateProvider.oauthUrls;
  #destType: string | null = null;

  targetUrl = model.required<string | null>();

  destinationType = computed(() => {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return null;

    const config = getConfigurationByKey(targetUrl.split('://')[0]);

    this.#destType = config?.customKey ?? config?.key;

    return this.#destType;
  });

  destinationForm = signal({
    custom: {} as Record<string, any>,
    dynamic: {} as Record<string, any>,
    advanced: {} as Record<string, any>,
  });

  advancedFormFieldNames = computed(() => Object.keys(this.destinationForm().advanced));
  destinationFormConfig = signal<DestinationConfig | null>(null);

  showTextArea = signal(false);

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
    const item = this.backendModules().find((x) => x.Key === _key) ?? {
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
        const order = value.order ?? index;
        destinationFormConfig.custom.push({ order: 900 + order, ...value });
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

        const order = overwriting && asDynamic?.order !== undefined ? asDynamic.order : index;

        const newField = {
          name: name,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          order: 900 + order,
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
        const order = overwriting && asAdvanced?.order !== undefined ? asAdvanced.order : index;

        const newField = {
          name: name as string,
          type: element.Type as ArgumentType,
          shortDescription: element.ShortDescription ?? undefined,
          longDescription: element.LongDescription ?? undefined,
          options: element.ValidValues,
          defaultValue: element.DefaultValue,
          order: 900 + order,
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

    const targetUrl = this.targetUrl();

    if (!targetUrl) return;

    const targetUrlData = fromTargetPath(targetUrl);

    if (!targetUrlData) return;

    this.destinationForm.set({
      custom: targetUrlData.custom,
      dynamic: targetUrlData.dynamic,
      advanced: targetUrlData.advanced,
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

  hasLeadingSlash(str?: string | null) {
    return str?.startsWith('/') ?? false;
  }

  addAdvancedOption(formView: FormView) {
    const form = this.destinationForm();

    form.advanced[formView.name] = formView.defaultValue;

    this.destinationForm.set({ ...form });
  }

  isValidBucketname(name: string): boolean {
    if (!name) return false;

    const length = name.length;

    // Length between 3 and 63 characters
    if (length < 3 || length > 63) return false;

    // Must be lowercase letters, numbers, dots, or hyphens
    if (!/^[a-z0-9.-]+$/.test(name)) return false;

    // Must start and end with a letter or number
    if (!/^[a-z0-9]/.test(name) || !/[a-z0-9]$/.test(name)) return false;

    // Cannot be formatted like an IP address
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(name)) return false;

    // Cannot contain adjacent periods or dashes next to periods
    if (/(\.\.)|(\.-)|(-\.)/.test(name)) return false;

    return true;
  }

  isValidHostname(hostname: string): boolean {
    if (!hostname || hostname.length > 253) return false;

    const labels = hostname.split('.');

    for (const label of labels) {
      // Each label must be 1–63 characters
      if (!label || label.length > 63) return false;

      // Must start and end with alphanumeric characters
      if (!/^[a-zA-Z0-9]([-a-zA-Z0-9]*[a-zA-Z0-9])?$/.test(label)) {
        return false;
      }
    }

    return true;
  }

  isTrue(value: any): boolean {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase();
      return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
    }
    return false;
  }

  onKeyDown(
    fieldGroup: 'custom' | 'dynamic' | 'advanced',
    fieldName: string,
    type: FormView['type'],
    event: KeyboardEvent
  ) {
    if (type === 'Hostname' || type === 'Bucketname') {
      const controlKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];
      if (controlKeys.includes(event.key)) return;
      if (event.key == '/' || event.key == '\\' || event.key == ':') {
        event.preventDefault();
        return;
      }
    }
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

  mapOptions(item: FormView): { key: string; value: string | null | undefined }[] | null | undefined {
    const loadOptions = item.loadOptions;
    if (loadOptions) return loadOptions(this.injector)();

    const options = item.options;
    if (options) return options.map((x) => ({ key: x, value: x }));

    return null;
  }

  mapOptionsWithFreeText(
    item: FormView,
    freeText: string | null | undefined
  ): { key: string; value: string | null | undefined }[] | null | undefined {
    const options = this.mapOptions(item);
    if (!options) return null;

    if (freeText && freeText.length > 0) {
      const existing = options.find((x) => x.value === freeText);
      if (!existing) {
        options.push({ key: freeText, value: freeText });
      }
    }

    return options;
  }

  #oauthInProgress = signal(false);

  oauthStartTokenCreation(
    backendKey: string,
    fieldGroup: 'custom' | 'dynamic' | 'advanced',
    fieldName: string,
    usev2?: number | null
  ) {
    this.#oauthInProgress.set(true);

    let oauthUrl = (usev2 ?? 1) == 2 ? this.oauthUrls().v2 : this.oauthUrls().v1;

    const backupServerOverride = this.backupServerOverride();
    const serverSettingsOverride = this.serverSettingsOverride();
    const formOverride = this.destinationForm().advanced['oauth-url'];

    if (serverSettingsOverride && serverSettingsOverride.length > 0) {
      oauthUrl = serverSettingsOverride;
    }

    if (backupServerOverride && backupServerOverride.length > 0) {
      oauthUrl = backupServerOverride;
    }

    if (formOverride && formOverride.length > 0) {
      oauthUrl = formOverride;
    }

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

  settingsAsText = computed(() => {
    const advanced = this.destinationForm().advanced;

    return Object.entries(advanced)
      .map(([key, value]) => {
        const name = key ?? '';
        let valueString = '';
        if (typeof value === 'boolean') {
          valueString = this.isTrue(value) ? 'True' : 'False';
        } else if (typeof value === 'number') {
          valueString = value.toString();
        } else if (value !== null && value !== undefined) {
          valueString = value.toString();
        }
        return `${name}=${valueString}`;
      })
      .join('\n');
  });

  updateSettingsFromText(newValue: any) {
    if (typeof newValue !== 'string') return;

    const lines = newValue
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const newSettings: Record<string, any> = {};

    for (const line of lines) {
      const [name, value] = line.split('=').map((part) => part.trim());
      if (name && name.trim().length > 0 && value !== undefined) {
        newSettings[name] = value;
      }
    }

    this.destinationForm.update((x) => ({
      ...x,
      advanced: newSettings,
    }));
  }
}
