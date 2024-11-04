import { FormControl, FormGroup } from '@angular/forms';
import { DestinationFormGroupValue } from './destination.component';
import { DESTINATION_CONFIG } from './destination.config';

type DestinationType = keyof typeof mappings | string;

export type DestinationFormGroup = FormGroup<{
  destinationType: FormControl<string>;
  custom: FormGroup<any>;
  dynamic: FormGroup<any>;
  advanced: FormGroup<any>;
}>;

export type ValueOfDestinationFormGroup = DestinationFormGroup['value'];

function handleSearchParams(destinationType: string, urlObj: URL) {
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

function toSearchParams(arr: [string, string | number | unknown][]) {
  const searchParamString = arr
    .map(([key, value]) => {
      return `${key}=${value ? encodeURIComponent((value as string | number).toString()) : ''}`;
    })
    .join('&');

  return searchParamString ? '?' + searchParamString : '';
}

const mappings = {
  file: {
    to: (fields: ValueOfDestinationFormGroup): string => {
      const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

      return `${fields.destinationType}://${fields.custom.path}${urlParams}`;
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      const hasLeadingSlash = plainPath.indexOf('file:///') === 0;
      const hostNameCapitalFirstLetter =
        plainPath.split(hasLeadingSlash ? '///' : '//')[1].substring(0, 1) + urlObj.hostname.substring(1);

      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          path: `${hasLeadingSlash ? '/' : ''}${hostNameCapitalFirstLetter}${urlObj.pathname}`,
        },
        ...handleSearchParams(destinationType, urlObj),
      };
    },
  },
  ssh: {
    to: (fields: any): string => {
      const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

      return `${fields.destinationType}://${fields.custom.server}${fields.custom.port ? ':' + fields.custom.port : ''}${fields.custom.path.startsWith('/') ? fields.custom.path : '/' + fields.custom.path}${urlParams}`;
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          server: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname,
        },
        ...handleSearchParams(destinationType, urlObj),
      };
    },
  },
  s3: {
    to: (fields: any): string => {
      const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

      return `${fields.destinationType}://${fields.custom.bucket}${fields.custom.path}${urlParams}`;
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          path: urlObj.pathname,
          bucket: urlObj.hostname,
        },
        ...handleSearchParams(destinationType, urlObj),
      };
    },
  },
  gcs: {
    to: (fields: any): string => {
      const bucket = fields.dynamic['gcs-location'] ?? '';

      delete fields.dynamic['gcs-location'];

      const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

      return `${fields.destinationType}://${bucket}${urlParams}`;
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      const { advanced, dynamic } = handleSearchParams(destinationType, urlObj);
      return <ValueOfDestinationFormGroup>{
        destinationType,
        advanced,
        dynamic: {
          ...dynamic,
          'gcs-location': urlObj.hostname + urlObj.pathname,
        },
      };
    },
  },
  googledrive: {
    to: (fields: any): string => {
      const path = fields.custom.path;
      const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

      return `${fields.destinationType}://${path}${urlParams}`;
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      const { advanced, dynamic } = handleSearchParams(destinationType, urlObj);

      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          path: urlObj.hostname + urlObj.pathname,
        },
        dynamic: dynamic,
        advanced: advanced,
      };
    },
  },

  fallbackMapper: {
    to: (fields: any): string => {
      return '';
    },
    from: (destinationType: string, urlObj: URL, plainPath: string) => {
      return <ValueOfDestinationFormGroup>{
        destinationType,
        ...handleSearchParams(destinationType, urlObj),
      };
    },
  },
};

export function toTargetPath(fields: DestinationFormGroupValue): string {
  const destinationType = fields.destinationType;

  if (!destinationType || !mappings.hasOwnProperty(destinationType)) {
    return ((mappings as any)['fallbackMapper'].to(fields) as string) ?? '';
  }

  return ((mappings as any)[destinationType].to(fields) as string) ?? '';
}

export function fromTargetPath(targetPath: string) {
  const canParse = URL.canParse(targetPath);
  const destinationType = targetPath.split('://')[0];
  const fakeProtocolPrefixed = 'http://' + targetPath.split('://')[1];
  const urlObj = new URL(fakeProtocolPrefixed);

  if (!mappings.hasOwnProperty(destinationType)) {
    return (mappings as any)['fallbackMapper'].from(destinationType, urlObj);
  }

  if (!canParse) {
    throw new Error('Invalid target path');
  }

  return (mappings as any)[destinationType].from(destinationType, urlObj, targetPath);
}
