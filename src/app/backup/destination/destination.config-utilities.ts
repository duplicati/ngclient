import { Injector, Signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { ArgumentType, ICommandLineArgument } from '../../core/openapi';
import { WebModuleOption } from '../../core/services/webmodules.service';
import { DestinationFormGroupValue } from './destination.component';
import { DESTINATION_CONFIG, DESTINATION_CONFIG_DEFAULT } from './destination.config';

export type ValueOfDestinationFormGroup = DestinationFormGroup['value'];
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };
export type DestinationFormGroup = FormGroup<{
  destinationType: FormControl<string | null>;
  custom: FormGroup<any>;
  dynamic: FormGroup<any>;
  advanced: FormGroup<any>;
}>;

export type DoubleSlashConfig = {
  type: 'warning' | 'error';
  message: string;
};

export type OAuthVersion = 1 | 2;

export type FormView = {
  name: string;
  type: ArgumentType | 'FileTree' | 'FolderTree' | 'NonValidatedSelectableString' | 'Email' | 'FreeText' | 'Hostname' | 'Bucketname';
  accepts?: string;
  shortDescription?: string;
  longDescription?: string;
  deprecatedDescription?: string;
  options?: ICommandLineArgument['ValidValues'];
  loadOptions?: (injector: Injector) => Signal<WebModuleOption[] | undefined>;
  defaultValue?: ICommandLineArgument['DefaultValue'];
  doubleSlash?: DoubleSlashConfig;
  oauthVersion?: OAuthVersion;
  order?: number;
  isMandatory?: boolean
};

export type CustomFormView = FormView & {
  formElement: any;
};

export type Mapping = {
  to: (fields: ValueOfDestinationFormGroup) => string;
  from: (destinationType: string, urlObj: URL, plainPath: string) => ValueOfDestinationFormGroup;
};

export type DestinationConfigEntry = {
  key: string;
  displayName: string;
  description: string;
  customKey?: string;
  oauthField?: string;
  customFields?: {
    [key: string]: CustomFormView;
  };
  mapper: Mapping;
  dynamicFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
  advancedFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
  ignoredAdvancedFields?: string[];
};
export type DestinationConfig = DestinationConfigEntry[];

export function buildUrlFromFields(fields: ValueOfDestinationFormGroup, server: string | null | undefined, port: string | number | null | undefined, path: string | null | undefined, ) {
  return buildUrl(
    fields.destinationType ?? 'file',
    server,
    port,
    path,
    [...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]
  );
}

export function buildUrl(protocol: string, server: string | null | undefined, port: string | number | null | undefined, path: string | null | undefined, args: [string, string | number | unknown][]) {
  const urlParams = toSearchParams(args);
  const serverPart = encodeURIComponent(addServer(server));
  const serverAndPortPart = serverPart == '' ? '' : serverPart + addPort(port);
  const pathPart = path ?? '';
  const isWindows = pathPart.slice(1).startsWith(':\\');
  const protocolPrefix = isWindows && protocol == 'file' ? 'file:///' : `${protocol}://`;

  const serverAndPath = concatPaths(serverAndPortPart, encodePathPreservingSlashes(pathPart));
  return `${protocolPrefix}${serverAndPath}${urlParams}`;
}

export function removeLeadingSlash(path: string | null | undefined) {
  if (path === null || path === undefined || path === '') return '';
  return path.startsWith('/') ? path.substring(1) : path;
}

export function concatPaths(...paths: (string | null | undefined)[]) {
  if (paths.length === 0) return '';
  if (paths.length === 1) return paths[0] ?? '';

  let result = '';
  for (const path of paths) {
    if (path === null || path === undefined || path === '') continue;
    result += result.endsWith('/') || result == '' ? path : '/' + path;
  }
  return result;
}

export function encodePathPreservingSlashes(path: string) {
  return path.split('/') .map(encodeURIComponent).join('/');
}

export function getSimplePath(url: URL | string | null | undefined) {
  if (url === null || url === undefined || url === '') return '';
  if (typeof url === 'string') {
    try {
      url = new URL(url);
    } catch (e) {
      return '';
    }
  }
  return decodeURIComponent(url.hostname ?? '') + decodeURIComponent(url.pathname == '/' ? '' : url.pathname ?? '');
}
  

export function addServer(server: string | null | undefined) {
  if (server === null || server === undefined || server === '') return '';
  return server.endsWith('/') ? server.substring(0, server.length - 1) : server;
}

export function addPort(port: string | number | null | undefined) {
  if (port === null || port === undefined || port === '') return '';

  return ':' + port.toString();
}

export function getConfigurationByKey(key: string): DestinationConfigEntry {
  const config = DESTINATION_CONFIG.find((x) => x.key === key || x.customKey === key)
    // Previous versions used 's' postfix as shorthand for enabling SSL (e.g. ftps, webdavs, etc.)
    ?? DESTINATION_CONFIG.find((x) => `${x.key}s` === key) 
    ?? null;
  
  return (
    config ?? {
      key: key,
      displayName: key,
      ...DESTINATION_CONFIG_DEFAULT,
    }
  );
}

export function fromUrlObj(urlObj: URL) {
  return {
    server: decodeURIComponent(urlObj.hostname),
    port: urlObj.port,
    path: removeLeadingSlash(decodeURIComponent(urlObj.pathname)),
  }
}

export function fromSearchParams(destinationType: string, urlObj: URL) {
  const advanced: { [key: string]: any } = {};
  const dynamic: { [key: string]: any } = {};
  const config = getConfigurationByKey(destinationType);

  urlObj.searchParams.forEach((value, key) => {
    const isDynamic = config?.dynamicFields?.some((x) => x === key || (<any>x)?.name === key);
    if (isDynamic) {
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

export function toSearchParams(arr: [string, string | number | unknown][], withoutQuestionMark = false) {
  const searchParamString = arr
    .map(([key, value]) => {
      return `${key}=${value ? encodeURIComponent((value as string | number).toString()) : ''}`;
    })
    .join('&');

  const questionMark = withoutQuestionMark ? '' : '?';

  return searchParamString ? questionMark + searchParamString : '';
}

export function toTargetPath(fields: DestinationFormGroupValue): string {
  const destinationType = fields.destinationType ?? '';
  const destinationConfig = getConfigurationByKey(destinationType);
  return destinationConfig?.mapper.to(fields) ?? '';
}

export function fromTargetPath(targetPath: string) {
  const canParse = URL.canParse(targetPath);
  const destinationType = targetPath.split('://')[0];
  const path = targetPath.split('://')[1];
  // Handle Windows paths that are not real URLs, e.g. file://C:/path/to/file
  const fakeProtocolPrefixed = destinationType === 'file'
    ? 'http://dummy'
    : 'http://' + path;

  if (!path) return null;

  // Only local files allow the shortcut file paths like file://%MUSIC%/music.mp3 to music folder
  if (path.startsWith('%') && destinationType === 'file') {
    return getConfigurationByKey(destinationType).mapper.from(
      destinationType,
      new URL('http://localhost'),
      targetPath
    );
  }

  const config = getConfigurationByKey(destinationType);

  // Previous versions used 's' postfix as shorthand for enabling SSL (e.g. ftps, webdavs, etc.)
  // If this is the case, we fix the url to use the correct protocol, and add the use-ssl query parameter
  let extraQuery = '';
  if (`${config.key}s` === destinationType)
  {
    extraQuery += fakeProtocolPrefixed.indexOf('?') === -1 ? '?' : '&';
    extraQuery += 'use-ssl=true';
    targetPath = config.key + targetPath.substring(destinationType.length);
  }

  try {
    const urlObj = new URL(fakeProtocolPrefixed + extraQuery);

    if (urlObj.host === 'undefined') return null;

    const pathWithoutParams = path.split('?')[0].split('/')[0];
    const hostAsNumber = !isNaN(Number(urlObj.host.replaceAll('.', '')));
    const pathSplit = pathWithoutParams.split('.');
    const hostAsIpAddress =
      pathSplit.length === 4 &&
      pathSplit.every((x) => x.length && x.length <= 3 && !isNaN(Number(x)) && parseInt(x) <= 255);

    if (hostAsNumber && !hostAsIpAddress) return null;

    return config.mapper.from(
      config.key,
      urlObj,
      targetPath
    );
  } catch (error) {
    console.error('Error while parsing target path', error);
    return null;
  }
}
