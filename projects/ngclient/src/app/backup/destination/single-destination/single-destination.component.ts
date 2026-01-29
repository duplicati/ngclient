import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  input,
  model,
  signal,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ShipButton,
  ShipDialogService,
  ShipFormField,
  ShipIcon,
  ShipMenu,
  ShipProgressBar,
  ShipSelect,
  ShipSpinner,
  ShipToggle,
  ShipToggleCard,
  ShipTooltip,
} from '@ship-ui/core';
import { distinctUntilChanged, finalize, map, of, switchMap, tap } from 'rxjs';
import { ConfirmDialogComponent } from '../../../core/components/confirm-dialog/confirm-dialog.component';
import { FileDropTextareaComponent } from '../../../core/components/file-drop-textarea/file-drop-textarea.component';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { SizeComponent } from '../../../core/components/size/size.component';
import { TimespanComponent } from '../../../core/components/timespan/timespan.component';
import { ArgumentType, ICommandLineArgument } from '../../../core/openapi';
import { WebModulesService } from '../../../core/services/webmodules.service';
import { DestinationConfigState } from '../../../core/states/destinationconfig.state';
import { SysinfoState } from '../../../core/states/sysinfo.state';
import { RemoteControlState } from '../../../settings/remote-control/remote-control.state';
import { ServerSettingsService } from '../../../settings/server-settings.service';
import { BackupState } from '../../backup.state';
import {
  CustomFormView,
  FormView,
  fromTargetPath,
  getConfigurationByUrl,
  isValidBucketname,
  isValidHostname,
  parseKeyValueTextToObject,
  toTargetPath,
} from '../destination.config-utilities';

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
    RouterLink,

    FileTreeComponent,
    SizeComponent,
    TimespanComponent,
    FileDropTextareaComponent,

    ShipFormField,
    ShipButton,
    ShipIcon,
    ShipToggleCard,
    ShipMenu,
    ShipSelect,
    ShipTooltip,
    ShipToggle,
    ShipProgressBar,
    ShipSpinner,
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
  #remoteControlState = inject(RemoteControlState);
  #webmoduleService = inject(WebModulesService);
  #dialogService = inject(ShipDialogService);
  injector = inject(Injector);
  targetUrl = model.required<string | null>();
  useBackupState = input(false);

  #destType: string | null = null;
  destinationType = computed(() => {
    const targetUrl = this.targetUrl();

    if (!targetUrl) return null;

    const config = getConfigurationByUrl(targetUrl);
    this.#destType = config?.customKey ?? config?.key;
    return this.#destType;
  });

  refreshView = signal(false);
  destinationForm = signal({
    custom: {} as Record<string, any>,
    dynamic: {} as Record<string, any>,
    advanced: {} as Record<string, any>,
  });

  advancedFormFieldNames = computed(() => Object.keys(this.destinationForm().advanced ?? {}));
  destinationFormConfig = signal<DestinationConfig | null>(null);

  showTextArea = signal(false);

  isLoadingRestoreBackupIdOptions = signal(false);
  isRestoreFlow = computed(() => !this.useBackupState());
  restoreBackupIdOptions = toSignal(
    toObservable(this.targetUrl).pipe(
      map((url) => {
        if (!url) {
          return {
            authKey: null as string | null,
            url: null as string | null,
            isRestore: this.isRestoreFlow(),
            hasKey: this.hasStorageApiKey(),
          };
        }

        const queryStart = url.indexOf('?');
        const query = queryStart >= 0 ? url.substring(queryStart + 1) : '';
        const params = new URLSearchParams(query);

        const apiId = params.get('duplicati-auth-apiid') ?? '';
        const apiKey = params.get('duplicati-auth-apikey') ?? '';

        const authKey = `${apiId}|${apiKey}`;

        return { authKey, url };
      }),
      distinctUntilChanged((a, b) => a.authKey === b.authKey),
      tap(({ url }) => {
        (this as any).lastRestoreAuthQueryUrl = url;
      }),
      switchMap(({ url }) => {
        if (url && url.startsWith('duplicati://') && this.hasStorageApiKey() && this.isRestoreFlow()) {
          this.isLoadingRestoreBackupIdOptions.set(true);
          return this.#webmoduleService
            .getDuplicatiStorageBackups(url)
            .pipe(finalize(() => this.isLoadingRestoreBackupIdOptions.set(false)));
        } else {
          return of<string[]>([]);
        }
      })
    ),
    {
      initialValue: [] as string[],
    }
  );
  isConnectedToConsole = computed(() => {
    return this.#remoteControlState.state() === 'connected';
  });

  hasStorageApiKey = computed(() => {
    return (this.#serverSettings.serverSettings()?.['remote-control-storage-api-id'] ?? '').length > 0;
  });

  isAuthenticatingFilen = signal(false);
  hasFilenApiKey = computed(() => {
    const form = this.destinationForm();
    const apiKey = form.advanced['api-key'];
    return apiKey && apiKey.length > 0;
  });

  nonSelectedAdvancedFormViews = computed(() => {
    const config = this.destinationFormConfig();

    if (!config) return [];

    const advancedFormFieldNames = this.advancedFormFieldNames();

    return config.advanced.filter(
      (x) => advancedFormFieldNames.findIndex((optionName) => optionName === x.name) === -1
    );
  });

  destinationTypeEffect = effect(() => {
    const targetUrl = this.targetUrl();

    const destinationConfig = getConfigurationByUrl(targetUrl ?? '');
    const protocolKey = destinationConfig.key;
    const visualKey = destinationConfig.customKey ?? protocolKey;

    const backendModuleItem = this.#destinationState.allModules().find((x) => x.Key === protocolKey) ?? {
      Key: protocolKey,
      DisplayName: destinationConfig.displayName,
      Description: destinationConfig.description,
      Options: [],
    };

    if (!backendModuleItem || !backendModuleItem.Options || !protocolKey) return;

    const oauthField = destinationConfig && destinationConfig.oauthField ? destinationConfig.oauthField : null;
    const customFields = destinationConfig && destinationConfig.customFields ? destinationConfig.customFields : {};
    const dynamicFields = destinationConfig && destinationConfig.dynamicFields ? destinationConfig.dynamicFields : [];
    const advancedFields =
      destinationConfig && destinationConfig.advancedFields ? destinationConfig.advancedFields : [];
    const ignoredAdvancedFields =
      destinationConfig && destinationConfig.ignoredAdvancedFields ? destinationConfig.ignoredAdvancedFields : [];

    const destinationFormConfig = {
      destinationType: visualKey,
      oauthField,
      custom: [] as FormView[],
      dynamic: [] as FormView[],
      advanced: [] as FormView[],
    } as DestinationConfig;

    if (customFields) {
      Object.entries(customFields).forEach(([key, value], index) => {
        const order = value.order ?? index;
        let validation = value.validate;
        if (!validation && value.type === 'Bucketname') {
          validation = (val: string) =>
            isValidBucketname(val) ? null : { type: 'error', message: $localize`Invalid bucket name.` };
        }
        if (validation && value.type === 'Hostname') {
          validation = (val: string) =>
            isValidHostname(val) ? null : { type: 'error', message: $localize`Invalid hostname.` };
        }
        destinationFormConfig.custom.push({ order: 900 + order, validate: validation, ...value });
      });
    }

    for (let index = 0; index < backendModuleItem.Options.length; index++) {
      const element = backendModuleItem.Options[index] as ICommandLineArgument;

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
    const _ = this.refreshView();

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

    let oauthUrl = (usev2 ?? 1) == 2 ? this.#sysinfo.defaultOAuthUrlV2() : this.#sysinfo.defaultOAuthUrl();

    const serverOverride = this.#serverSettings.serverSettings()?.['--oauth-url'];
    if (serverOverride && serverOverride.length > 0) oauthUrl = serverOverride;

    if (this.useBackupState()) {
      const backupServerOverride = this.#backupState.mapFormsToSettings().find((x) => x.Name === '--oauth-url')?.Value;
      if (backupServerOverride && backupServerOverride.length > 0) oauthUrl = backupServerOverride;
    }

    const formOverride = this.destinationForm().advanced['oauth-url'];
    if (formOverride && formOverride.length > 0) oauthUrl = formOverride;

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
        this.refreshView.set(!this.refreshView());
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

    const newSettings = parseKeyValueTextToObject(newValue);
    this.destinationForm.update((x) => ({
      ...x,
      advanced: newSettings,
    }));
  }

  getIsDisabled(formFieldId: string): boolean {
    const inputElement = document.getElementById(formFieldId) as HTMLInputElement | null;
    return inputElement?.disabled ?? true;
  }

  toggleDisabled(formFieldId: string) {
    const inputElement = document.getElementById(formFieldId) as HTMLInputElement | null;
    if (inputElement) {
      inputElement.disabled = !inputElement.disabled;
    }
  }

  openConsole() {
    this.#remoteControlState.openConsole();
  }

  #performFilenAuth(url: string) {
    var backupId = this.useBackupState() ? this.#backupState.backupId() : null;
    this.isAuthenticatingFilen.set(true);
    this.#webmoduleService
      .getFilenApiKey(url, backupId)
      .pipe(finalize(() => this.isAuthenticatingFilen.set(false)))
      .subscribe({
        next: (apiKey) => {
          if (apiKey.length === 0) {
            this.#dialogService.open(ConfirmDialogComponent, {
              data: {
                title: $localize`Authentication failed`,
                message: $localize`No API key was returned from the Filen server.`,
                confirmText: $localize`OK`,
              },
            });
            return;
          }

          this.destinationForm.update((y) => {
            y.advanced['api-key'] = apiKey;
            y.dynamic['two-factor-code'] = null;
            return y;
          });
          this.refreshView.set(!this.refreshView());
        },
        error: (error) => {
          console.error('Error authenticating Filen', error);
          this.#dialogService.open(ConfirmDialogComponent, {
            data: {
              title: $localize`Authentication failed`,
              message: $localize`An error occurred while requesting the Filen API key: ${error.message}`,
              confirmText: $localize`OK`,
            },
          });
        },
      });
  }

  authenticateFilen() {
    const url = this.targetUrl();
    if (!url) return;

    const form = this.destinationForm();
    const apiKey = form.advanced['api-key'];

    if (apiKey && apiKey.length > 0) {
      this.#dialogService.open(ConfirmDialogComponent, {
        data: {
          title: $localize`Confirm re-authenticate?`,
          message: $localize`You already have an API key. Are you sure you want to re-authenticate?`,
          confirmText: $localize`Yes`,
          cancelText: $localize`Cancel`,
        },
        closed: (res) => {
          if (!res) return;

          // Remove 'api-key' temporarily to force re-authentication
          var u = new URL(url);
          u.searchParams.delete('api-key');
          this.#performFilenAuth(u.toString());
        },
      });
      return;
    }

    this.#performFilenAuth(url);
  }
}
