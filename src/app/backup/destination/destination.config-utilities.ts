import { Injector, Signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ArgumentType, ICommandLineArgument } from '../../core/openapi';
import { WebModuleOption } from '../../core/services/webmodules.service';
import { DestinationFormGroupValue } from './destination.component';
import { DESTINATION_CONFIG } from './destination.config';

export type ValueOfDestinationFormGroup = DestinationFormGroup['value'];
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
export type DestinationFormGroup = FormGroup<{
  destinationType: FormControl<string | null>;
  custom: FormGroup<any>;
  dynamic: FormGroup<any>;
  advanced: FormGroup<any>;
}>;

export type FormView = {
  name: string;
  type: ArgumentType | 'FileTree' | 'FolderTree' | 'NonValidatedSelectableString';
  accepts?: string;
  shortDescription?: string;
  longDescription?: string;
  options?: ICommandLineArgument['ValidValues'];
  loadOptions?: (injector: Injector) => Signal<WebModuleOption[] | undefined>;
  defaultValue?: ICommandLineArgument['DefaultValue'];
  order?: number;
};

export type CustomFormView = FormView & {
  formElement: any;
};

export type Mapping = {
  to: (fields: ValueOfDestinationFormGroup) => string;
  from: (destinationType: string, urlObj: URL, plainPath: string) => ValueOfDestinationFormGroup;
};

export type DestinationConfig = {
  [key: string]: {
    title: string;
    description: string;
    oauthField?: string;
    customFields?: {
      [key: string]: CustomFormView;
    };
    mapper: Mapping;
    dynamicFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
    advancedFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
    ignoredAdvancedFields?: string[];
  };
};

export function addPort(port: string | number | null | undefined) {
  if (port === null || port === undefined) return '';

  return ':' + port.toString();
}

export function addPath(path: string | null | undefined) {
  if (path === null || path === undefined) return '';

  return path.startsWith('/') ? path : '/' + path;
}

export function fromSearchParams(destinationType: string, urlObj: URL) {
  const advanced: { [key: string]: any } = {};
  const dynamic: { [key: string]: any } = {};

  urlObj.searchParams.forEach((value, key) => {
    if (DESTINATION_CONFIG[destinationType].dynamicFields?.includes(key)) {
      dynamic[key] = decodeURIComponent(value);
    } else {
      advanced[key] = decodeURIComponent(value);
    }
  });

  return {
    advanced,
    dynamic,
  };
}

export function toSearchParams(arr: [string, string | number | unknown][]) {
  const searchParamString = arr
    .map(([key, value]) => {
      return `${key}=${value ? encodeURIComponent((value as string | number).toString()) : ''}`;
    })
    .join('&');

  return searchParamString ? '?' + searchParamString : '';
}

export function toTargetPath(fields: DestinationFormGroupValue): string {
  const destinationType = fields.destinationType;

  if (!destinationType || !DESTINATION_CONFIG.hasOwnProperty(destinationType)) {
    throw new Error('Invalid destination type');
  }

  return DESTINATION_CONFIG[destinationType].mapper.to(fields) ?? '';
}

export function fromTargetPath(targetPath: string) {
  const canParse = URL.canParse(targetPath);
  const destinationType = targetPath.split('://')[0];
  const fakeProtocolPrefixed = 'http://' + targetPath.split('://')[1];
  const urlObj = new URL(fakeProtocolPrefixed);

  if (!canParse) {
    throw new Error('Invalid target path');
  }

  return DESTINATION_CONFIG[destinationType].mapper.from(destinationType, urlObj, targetPath);
}
