import { signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ArgumentType } from '../../core/openapi';
import { WebModulesService } from '../../core/services/webmodules.service';
import {
  buildUrl,
  buildUrlFromFields,
  concatPaths,
  CustomFormView,
  DestinationConfig,
  DestinationConfigEntry,
  DoubleSlashConfig,
  fromSearchParams,
  fromUrlObj,
  getSimplePath,
  toSearchParams,
  UrlLike,
  ValueOfDestinationFormGroup,
} from './destination.config-utilities';

const fb = new FormBuilder();

/**
 * Important!!
 *
 * Read this before adding a new destination
 * It's important to keep the same order of the destinations in the config
 * Not for run time purposes but to easy write and maintain them
 *
 * To add a new destination:
 * 1. Add the title and description needed to select the destination
 * 2. Then add the fields that are needed to configure the destination
 * 3. Then add the mapper to convert the fields to a string and back
 */

// TODO - Avoid loading all "loadOptions" at once and only if their destination is selected
// TODO - add better runtime validation for the fields
// TODO - deprecate the customFields just replace advancedFields if they come from the backend,
//        otherwise expect them as custom fields this way we can enforce order.
// NTH - add that dynamic fields are order sensitive instead of using the order field
// NTH - add support for a server/port field type
// NTH - Would be great to use the typing of the fields to validate the mapper if all fields are mapped

const DEFAULT_DOUBLESLASH_CONFIG: DoubleSlashConfig = {
  type: 'error',
  message: $localize`Using a leading slash is most likely wrong, and will result in objects being created with a leading slash in the name.`,
};

export const DESTINATION_CONFIG_DEFAULT = {
  description: $localize`Unknown destination type`,
  icon: 'assets/dest-icons/file-system.png',
  isDefaultEntry: true,
  customFields: {
    path: {
      type: 'String' as ArgumentType,
      name: 'path',
      doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
      shortDescription: $localize`Path`,
      formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
    },
  },
  mapper: {
    to: (fields: ValueOfDestinationFormGroup): string => {
      return buildUrlFromFields(fields, null, null, fields.custom.path);
    },
    from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
      const hasLeadingSlash = plainPath.startsWith(`${destinationType}:///`);
      const path = hasLeadingSlash
        ? plainPath.split(`${destinationType}:///`)[1]
        : plainPath.split(`${destinationType}://`)[1];

      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          path: path.split('?')[0],
        },
        ...fromSearchParams(destinationType, urlObj),
      };
    },
  },
};

const S3_BASE: DestinationConfigEntry = {
  key: 's3',
  displayName: $localize`S3 Compatible`,
  description: $localize`Store backups in any S3 compatible bucket.`,
  icon: 'assets/dest-icons/s3compat.png',
  customFields: {
    bucket: {
      type: 'Bucketname',
      name: 'bucket',
      shortDescription: $localize`Bucket name`,
      longDescription: $localize`Bucket name`,
      formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      isMandatory: true,
    },
    path: {
      type: 'Path',
      name: 'path',
      doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
      shortDescription: $localize`Folder path`,
      longDescription: $localize`Folder path`,
      formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
    },
  },
  dynamicFields: [
    {
      name: 's3-server-name',
      order: 1,
      shortDescription: $localize`Server`,
      longDescription: $localize`The hostname of the S3 compatible server to connect to`,
      type: 'NonValidatedSelectableString', // Convert to string before submitting
      loadOptions: (injector) => injector.get(WebModulesService).getS3AllProviders(),
      isMandatory: true,
      formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
    },
    {
      name: 'auth-username',
      isMandatory: true,
    },
    {
      name: 'auth-password',
      isMandatory: true,
    },
    {
      name: 'use-ssl',
    },
  ],
  advancedFields: [
    {
      name: 's3-client',
      type: 'Enumeration', // Convert to string before submitting
      loadOptions: () => {
        return signal([
          {
            key: 'AWS Library',
            value: 'aws',
          },
          {
            key: 'MinIO Library',
            value: 'minio',
          },
        ]);
      },
    },
  ],
  mapper: {
    to: (fields: ValueOfDestinationFormGroup): string => {
      const { bucket, path } = fields.custom;
      return buildUrlFromFields(fields, bucket, null, path);
    },
    from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
      const { bucket, path } = fromUrlObj(urlObj);
      return <ValueOfDestinationFormGroup>{
        destinationType,
        custom: {
          path: path,
          bucket: bucket,
        },
        ...fromSearchParams(destinationType, urlObj),
      };
    },
  },
};

function CreateCustomS3ProviderEntry(
  customKey: string,
  displayName: string,
  description: string | null,
  icon: string | null,
  hostnameEndsWith: string[]
): DestinationConfigEntry {
  return {
    ...S3_BASE,
    customKey: `s3-${customKey}`,
    icon: icon ?? S3_BASE.icon,
    displayName: $localize`${displayName} (S3)`,
    description: description ?? $localize`Store backups in ${displayName} storage.`,
    dynamicFields: [
      ...(S3_BASE.dynamicFields ?? []).filter((f) => (<CustomFormView>f)?.name !== 's3-server-name'),
      {
        name: 's3-server-name',
        order: 1,
        shortDescription: $localize`Server`,
        longDescription: $localize`The hostname of the ${displayName} endpoint`,
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) =>
          injector
            .get(WebModulesService)
            .getS3ProvidersFiltered((option) => hostnameEndsWith.some((suffix) => option.value.endsWith(suffix))),
        isMandatory: true,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    ],
    mapper: {
      ...S3_BASE.mapper,
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        if (hostnameEndsWith.some((suffix) => fields.dynamic['s3-server-name']?.endsWith(suffix)))
          fields.destinationType = `s3`;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      default: (backupName: string): string => {
        return `s3-${customKey}://?use-ssl=true`;
      },
      intercept: (urlObj: UrlLike): boolean => {
        return hostnameEndsWith.some((suffix) => urlObj.searchParams.get('s3-server-name')?.endsWith(suffix)) ?? false;
      },
    },
  };
}

export const DESTINATION_CONFIG: DestinationConfig = [
  {
    key: 'file',
    displayName: $localize`File system`,
    description: $localize`Store backups on your local file system.`,
    icon: 'assets/dest-icons/file-system.png',
    searchTerms: 'local disk harddrive localdisk filesystem unc server share drive',
    sortOrder: 100,
    customFields: {
      path: {
        type: 'FolderTree',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`File path`,
        longDescription: $localize`The path to store the backup`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
    },
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const hasLeadingSlash = plainPath.startsWith('file:///');
        const _tempPath = decodeURIComponent(
          hasLeadingSlash ? plainPath.split('file:///')[1] : plainPath.split('file://')[1]
        );
        const isWindows =
          _tempPath.slice(1).startsWith(':\\') || _tempPath.slice(1).startsWith(':/') || _tempPath.startsWith('\\\\'); // Check for drive letter or UNC path

        const path = isWindows ? _tempPath : '/' + _tempPath;

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path.split('?')[0],
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'ssh',
    displayName: $localize`SSH`,
    description: $localize`Store backups with SSH.`,
    icon: 'assets/dest-icons/ssh.png',
    searchTerms: 'sftp scp secure shell',
    sortOrder: 80,
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`The server to connect to`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`The port to connect to`,
        formElement: (defaultValue?: string) =>
          fb.control<string>(defaultValue ?? '', [Validators.required, Validators.max(65535)]),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        doubleSlash: {
          type: 'warning',
          message: $localize`Using a leading slash makes the path absolute, pointing to the root of the filesystem.`,
        },
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        isMandatory: true,
      },
    ],
    advancedFields: [
      {
        type: 'FileTree',
        name: 'ssh-keyfile',
        accepts: '.key,',
        shortDescription: $localize`This is a path to a private key file locally on the machine`,
        longDescription: $localize`This is a path to a private key file locally on the machine`,
      },
      {
        type: 'FreeText',
        name: 'ssh-key',
        shortDescription: $localize`SSH private key`,
        longDescription: $localize`An SSH private key. Supported formats are OpenSSL, OpenSSH, PuTTY, and PEM.`,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { server, port, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server,
            port,
            path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 's3',
    displayName: $localize`S3 Compatible`,
    description: $localize`Store backups in any S3 compatible bucket.`,
    icon: 'assets/dest-icons/s3compat.png',
    searchTerms:
      'spaces cloud digitalocean cloudian minio linode bunnycdn oracle cloudflare alibaba huawei tencent baidu jd ucloud qiniu aliyun tcloud tencent ',
    sortOrder: 90,
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        longDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 's3-server-name',
        order: 1,
        shortDescription: $localize`Server`,
        longDescription: $localize`The hostname of the S3 compatible server to connect to`,
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getS3AllProviders(),
        isMandatory: true,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      {
        name: 'use-ssl',
        order: 2,
      },
      {
        name: 'auth-username',
        isMandatory: true,
      },
      {
        name: 'auth-password',
        isMandatory: true,
      },
    ],
    advancedFields: [
      {
        name: 's3-client',
        type: 'Enumeration', // Convert to string before submitting
        loadOptions: () => {
          return signal([
            {
              key: 'AWS Library',
              value: 'aws',
            },
            {
              key: 'MinIO Library',
              value: 'minio',
            },
          ]);
        },
      },
      {
        name: 's3-storage-class',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getS3StorageClasses(),
      },
      {
        name: 's3-location-constraint',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getS3Regions(),
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path,
            bucket: bucket,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 's3',
    customKey: 's3-aws',
    displayName: $localize`Amazon S3`,
    description: $localize`Store backups in Amazon S3.`,
    icon: 'assets/dest-icons/aws.png',
    searchTerms: 'amazon aws',
    sortOrder: 90,
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        longDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 's3-server-name',
        order: 1,
        shortDescription: $localize`Server`,
        longDescription: $localize`The hostname of the S3 compatible server to connect to`,
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) =>
          injector.get(WebModulesService).getS3ProvidersFiltered((x) => x.value.endsWith('.amazonaws.com')),
        isMandatory: true,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      {
        name: 'use-ssl',
        order: 2,
      },
      {
        name: 'auth-username',
        isMandatory: true,
      },
      {
        name: 'auth-password',
        isMandatory: true,
      },
    ],
    advancedFields: [
      {
        name: 's3-client',
        type: 'Enumeration', // Convert to string before submitting
        loadOptions: () => {
          return signal([
            {
              key: 'AWS Library',
              value: 'aws',
            },
            {
              key: 'MinIO Library',
              value: 'minio',
            },
          ]);
        },
      },
      {
        name: 's3-storage-class',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getS3StorageClasses(),
      },
      {
        name: 's3-location-constraint',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getS3Regions(),
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        if (fields.dynamic['s3-server-name']?.endsWith('.amazonaws.com')) fields.destinationType = `s3`;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path,
            bucket: bucket,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
      default: (backupName: string): string => {
        return `s3-aws://?use-ssl=true`;
      },
      intercept: (urlObj: UrlLike): boolean => {
        return urlObj.searchParams.get('s3-server-name')?.endsWith('.amazonaws.com') ?? false;
      },
    },
  },
  {
    key: 'gcs',
    displayName: $localize`Google Cloud Storage`,
    description: $localize`Store backups in Google Cloud Storage.`,
    icon: 'assets/dest-icons/google-cloud.png',
    oauthField: 'authid',
    searchTerms: 'gcp googlecloud',
    sortOrder: 70,
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        longDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
        longDescription: $localize`An OAuth token with access to the Google Cloud Storage. Not required if service account JSON is provided.`,
      },
    ],
    advancedFields: [
      {
        name: 'gcs-location',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getGcsLocations(),
      },
      {
        name: 'gcs-storage-class',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).getGcsStorageClasses(),
      },
      {
        name: 'gcs-service-account-file',
        type: 'FileTree',
        accepts: '.json,',
        shortDescription: $localize`Service account JSON file`,
        longDescription: $localize`Pick the path to a file with service account JSON.`,
      },
      {
        name: 'gcs-service-account-json',
        type: 'FreeText',
        shortDescription: $localize`Service account JSON`,
        longDescription: $localize`Paste the service account JSON here.`,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path,
            bucket: bucket,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'googledrive',
    displayName: $localize`Google Drive`,
    description: $localize`Store backups in Google Drive.`,
    icon: 'assets/dest-icons/google-drive.png',
    oauthField: 'authid',
    searchTerms: 'gdrive',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        type: 'Password',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'pcloud',
    displayName: $localize`pCloud`,
    description: $localize`Store backups in pCloud.`,
    icon: 'assets/dest-icons/pcloud.png',
    oauthField: 'authid',
    customFields: {
      server: {
        type: 'Enumeration',
        name: 'server',
        loadOptions: () => {
          return signal([
            {
              key: 'pCloud Global',
              value: 'api.pcloud.com',
            },
            {
              key: 'pCloud Europe',
              value: 'eapi.pcloud.com',
            },
          ]);
        },
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Folder path`,
        longDescription: $localize`Folder path`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        type: 'Password',
        oauthVersion: 2,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { server, path } = fields.custom;
        return buildUrlFromFields(fields, server, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'azure',
    displayName: $localize`Azure Blob Storage`,
    description: $localize`Store backups in Azure Blob Storage.`,
    icon: 'assets/dest-icons/azure.png',
    searchTerms: 'microsoft ms',
    sortOrder: 60,
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Container name`,
        longDescription: $localize`Container name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Account name`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Access key`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'onedrivev2',
    displayName: $localize`OneDrive`,
    description: $localize`Store backups in OneDrive.`,
    icon: 'assets/dest-icons/one-drive.png',
    oauthField: 'authid',
    searchTerms: 'micorsoft ms',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'od4b',
    displayName: $localize`OneDrive Business`,
    description: $localize`Store backups in OneDrive Business.`,
    icon: 'assets/dest-icons/one-drive.png',
    searchTerms: 'microsoft ms',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Account name`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Access key`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { port, server, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'mssp',
    displayName: $localize`Microsoft SharePoint`,
    description: $localize`Store backups in Microsoft SharePoint.`,
    icon: 'assets/dest-icons/sharepoint.png',
    searchTerms: 'microsoft ms',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Account name`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Access key`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { port, server, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'sharepoint',
    displayName: $localize`Microsoft SharePoint v2`,
    description: $localize`Store backups in Microsoft SharePoint.`,
    icon: 'assets/dest-icons/sharepoint.png',
    oauthField: 'authid',
    searchTerms: 'microsoft ms',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'site-id',
        isMandatory: true,
      },
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'dropbox',
    displayName: $localize`Dropbox`,
    description: $localize`Store backups in Dropbox.`,
    icon: 'assets/dest-icons/dropbox.png',
    oauthField: 'authid',
    searchTerms: 'dbx',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'box',
    displayName: $localize`Box.com`,
    description: $localize`Store backups in Box.com.`,
    icon: 'assets/dest-icons/box-com.png',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'jottacloud',
    displayName: $localize`Jottacloud`,
    description: $localize`Store backups in Jottacloud.`,
    icon: 'assets/dest-icons/jottacloud.png',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'b2',
    displayName: $localize`B2 Cloud Storage`,
    description: $localize`Store backups in B2 Cloud Storage.`,
    icon: 'assets/dest-icons/backblaze.png',
    searchTerms: 'backblaze',
    customFields: {
      bucket: {
        type: 'BucketnameB2',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        longDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path in the bucket`,
        longDescription: $localize`Path in the bucket`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Application ID`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Application Key`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        const { bucket, path } = fields.custom;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path,
            bucket: bucket,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'e2',
    displayName: $localize`IDrive e2`,
    description: $localize`Store backups in IDrive e2.`,
    icon: 'assets/dest-icons/idrive-e2.png',
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        longDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'String',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path in the bucket`,
        longDescription: $localize`Path in the bucket`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Access ID`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Access Secret`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        const { bucket, path } = fields.custom;
        return buildUrlFromFields(fields, bucket, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            bucket: bucket,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'mega',
    displayName: $localize`Mega.nz`,
    description: $localize`Store backups in Mega.nz.`,
    icon: 'assets/dest-icons/mega-nz.png',
    sortOrder: -1,
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Username`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Password`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        const path = fields.custom.path;
        return buildUrlFromFields(fields, null, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'msgroup',
    displayName: $localize`Microsoft Office 365 Group`,
    description: $localize`Store backups in Microsoft Office 365 Group.`,
    icon: 'assets/dest-icons/office-365.png',
    oauthField: 'authid',
    searchTerms: 'ms',
    customFields: {
      groupEmail: {
        type: 'Email',
        name: 'groupEmail',
        shortDescription: $localize`Group email`,
        longDescription: $localize`Group email`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? '', [Validators.email]),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'authid',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup) => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'cloudfiles',
    displayName: $localize`Rackspace CloudFiles`,
    description: $localize`Store backups in Rackspace CloudFiles.`,
    icon: 'assets/dest-icons/rackspace.png',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Username`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Password`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { port, server, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'rclone',
    displayName: $localize`Rclone`,
    description: $localize`Store backups in Rclone.`,
    icon: 'assets/dest-icons/rclone.png',
    searchTerms: 'rcl',
    dynamicFields: [
      {
        name: 'rclone-local-repository',
        shortDescription: $localize`Local repository`,
        defaultValue: '',
      },
      {
        name: 'rclone-remote-repository',
        shortDescription: $localize`Remote repository`,
        defaultValue: '',
      },
      {
        name: 'rclone-remote-path',
        type: 'Path',
        shortDescription: $localize`Path on remote repository`,
        defaultValue: '',
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const rcloneRemoteRepository = fields.dynamic['rclone-remote-repository'];
        const rcloneRemotePath = fields.dynamic['rclone-remote-path'];
        const rest = Object.entries(fields.dynamic).filter(
          ([key]) => !['rclone-remote-repository', 'rclone-remote-path'].includes(key)
        );

        return buildUrl(fields.destinationType ?? 'rclone', rcloneRemoteRepository, null, rcloneRemotePath, [
          ...Object.entries(fields.advanced ?? {}),
          ...rest,
        ]);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { advanced, dynamic } = fromSearchParams(destinationType, urlObj);
        const { bucket, path } = fromUrlObj(urlObj);

        return <ValueOfDestinationFormGroup>{
          destinationType,
          dynamic: {
            'rclone-remote-repository': bucket,
            'rclone-remote-path': path,
            ...dynamic,
          },
          ...advanced,
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'openstack',
    displayName: $localize`OpenStack Object Storage`,
    description: $localize`Store backups in OpenStack Object Storage.`,
    icon: 'assets/dest-icons/open-stack.png',
    searchTerms: 'swift',
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket`,
        longDescription: $localize`Bucket`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
    },
    dynamicFields: [
      {
        name: 'openstack-authuri',
        shortDescription: $localize`Auth URI`,
        type: 'Enumeration',
        loadOptions: (injector) => injector.get(WebModulesService).getOpenstackProviders(),
        isMandatory: true,
      },
      {
        name: 'openstack-version',
        shortDescription: $localize`Version`,
        type: 'Enumeration',
        loadOptions: (injector) => injector.get(WebModulesService).getOpenstackVersions(),
      },
      {
        name: 'openstack-domain-name',
        type: 'Hostname',
        shortDescription: $localize`Domain name`,
      },
      {
        name: 'openstack-tenant-name',
        shortDescription: $localize`Tenant name`,
      },
      {
        name: 'openstack-region',
        shortDescription: $localize`Region`,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket } = fields.custom;
        return buildUrlFromFields(fields, bucket, null, null);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { bucket, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: path,
            bucket: bucket,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'webdav',
    displayName: $localize`WebDAV`,
    description: $localize`Store backups in WebDAV.`,
    icon: 'assets/dest-icons/webdav.png',
    searchTerms: 'web dav',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'use-ssl',
        shortDescription: $localize`Use SSL`,
      },
      {
        name: 'auth-username',
        shortDescription: $localize`Username`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Password`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { server, port, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  {
    key: 'aftp',
    displayName: $localize`Alternative FTP`,
    description: $localize`Store backups in FTP.`,
    icon: 'assets/dest-icons/ftp.png',
    searchTerms: 'alt file transfer protocol ftps',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        doubleSlash: {
          type: 'warning',
          message: $localize`Using a leading slash makes the path absolute, pointing to the root of the filesystem.`,
        },
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Username`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Password`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { server, port, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  {
    key: 'ftp',
    displayName: $localize`FTP`,
    description: $localize`Store backups in FTP.`,
    icon: 'assets/dest-icons/ftp.png',
    searchTerms: 'file transfer protocol ftps',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        doubleSlash: {
          type: 'warning',
          message: $localize`Using a leading slash makes the path absolute, pointing to the root of the filesystem.`,
        },
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: $localize`Username`,
        isMandatory: true,
      },
      {
        name: 'auth-password',
        shortDescription: $localize`Password`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { port, server, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'sia',
    displayName: $localize`Sia Decentrilized Cloud`,
    description: $localize`Store backups in Sia Decentrilized Cloud.`,
    icon: 'assets/dest-icons/sia-cloud.png',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
    },
    dynamicFields: ['sia-targetpath', 'sia-password', 'sia-redundancy'],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const server = fields.custom.server;
        const targetpath = fields.dynamic['sia-targetpath'];
        const urlParams = [
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'sia-targetpath'),
        ];

        return buildUrl(fields.destinationType ?? 'sia', server, null, targetpath, urlParams);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'cos',
    displayName: $localize`Tencent COS`,
    description: $localize`Store backups in Tencent COS.`,
    icon: 'assets/dest-icons/tencent-cloud.png',
    customFields: {
      bucket: {
        name: 'bucket',
        type: 'Bucketname',
        shortDescription: $localize`Bucket`,
        isMandatory: true,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'cos-region',
        shortDescription: $localize`Region`,
      },
      {
        name: 'cos-app-id',
        shortDescription: $localize`COS App Id`,
        isMandatory: true,
      },
      {
        name: 'cos-secret-id',
        shortDescription: $localize`COS Secret Id`,
        isMandatory: true,
      },
      {
        name: 'cos-secret-key',
        shortDescription: $localize`COS Secret Key`,
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        const patched = {
          ...fields,
          advanced: {
            ...fields.advanced,
            'cos-bucket': bucket,
          },
        };

        return buildUrlFromFields(patched, null, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const searchParams = fromSearchParams(destinationType, urlObj);
        const bucket = searchParams.advanced['cos-bucket'];
        delete searchParams.advanced['cos-bucket'];

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
            bucket: bucket,
          },
          ...searchParams,
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'tahoe',
    displayName: $localize`Tahoe LAFS`,
    description: $localize`Store backups in Tahoe LAFS.`,
    icon: 'assets/dest-icons/tahoelafs.png',
    searchTerms: 'least authority file system',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: $localize`Port`,
        longDescription: $localize`Port`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'use-ssl',
        shortDescription: $localize`Use SSL`,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { server, port, path } = fields.custom;
        return buildUrlFromFields(fields, server, port, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, port, path } = fromUrlObj(urlObj);
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            port: port,
            path: path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'smb',
    displayName: $localize`Windows Share (SMB)`,
    description: $localize`Store backups on SMB storage.`,
    icon: 'assets/dest-icons/smb.png',
    searchTerms: 'cifs samba',
    customFields: {
      server: {
        type: 'Hostname',
        name: 'server',
        shortDescription: $localize`Server`,
        longDescription: $localize`Server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      share: {
        type: 'Hostname',
        name: 'share',
        shortDescription: $localize`Share Name`,
        longDescription: $localize`Share Name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on server`,
        longDescription: $localize`Path on server`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      'transport',
      {
        name: 'auth-username',
        isMandatory: true,
      },
      {
        name: 'auth-password',
        isMandatory: true,
      },
      'auth-domain',
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { share, server, path } = fields.custom;
        return buildUrlFromFields(fields, server, null, concatPaths(share, path));
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const { server, path } = fromUrlObj(urlObj);

        const share = path.split('/')[0];
        const subpath = path.split('/').slice(1).join('/');

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: server,
            share: share,
            path: subpath,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'cifs',
    displayName: $localize`CIFS (deprecated)`,
    description: $localize`Same as SMB backend, but with a different name. Use SMB instead.`,
    icon: 'assets/dest-icons/smb.png',
    sortOrder: -1,
    mapper: DESTINATION_CONFIG_DEFAULT.mapper,
  },
  {
    key: 'filen',
    displayName: $localize`Filen.io`,
    description: $localize`Store backups in Filen.io.`,
    icon: 'assets/dest-icons/filen.png',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on Filen`,
        longDescription: $localize`Path on Filen`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        isMandatory: true,
      },
      {
        name: 'auth-password',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        return buildUrlFromFields(fields, null, null, fields.custom.path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'filejump',
    displayName: $localize`Filejump`,
    description: $localize`Store backups in Filejump.`,
    icon: 'assets/dest-icons/file-jump.png',
    sortOrder: -1,
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path on Filejump`,
        longDescription: $localize`Path on Filejump`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        type: 'Password',
        name: 'api-token',
        shortDescription: $localize`API Token`,
        longDescription: $localize`Filejump API Token`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      // TODO: Support password based auth?
      // 'auth-username',
      // 'auth-password'
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { path } = fields.custom;
        return buildUrlFromFields(fields, null, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'storj',
    customKey: 'storjAccessGrant',
    displayName: $localize`Storj Access Grant`,
    description: $localize`Store backups in Storj Access Grant.`,
    icon: 'assets/dest-icons/storj.png',
    dynamicFields: [
      {
        name: 'storj-shared-access',
        shortDescription: $localize`Access Grant`,
        isMandatory: true,
      },
      {
        name: 'storj-bucket',
        type: 'Bucketname',
        shortDescription: $localize`Bucket`,
        isMandatory: true,
      },
      {
        name: 'storj-folder',
        type: 'Path',
        shortDescription: $localize`Path on server`,
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
      },
      {
        name: 'storj-satellite',
        shortDescription: $localize`Satellite`,
        type: 'NonValidatedSelectableString',
        loadOptions: (injector) => injector.get(WebModulesService).getStorjSatellites(),
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const obj = { 'storj-auth-method': 'Acccess grant' };
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic),
          ...Object.entries(obj),
        ]);
        return `storj://storj.io/config${urlParams}`;
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const fields = fromSearchParams(destinationType, urlObj);
        delete fields.advanced['storj-auth-method'];
        return <ValueOfDestinationFormGroup>{
          destinationType,
          ...fields,
        };
      },

      intercept: (urlObj: UrlLike): boolean => {
        if (urlObj.protocol !== 'storj:') return false;

        if (urlObj.searchParams.get('storj-shared-access')) return true;
        if (urlObj.searchParams.get('storj-auth-method') === 'Acccess grant') return true;

        return false;
      },

      default: () => 'storj://?storj-shared-access=&storj-auth-method=Acccess+grant',
    },
  },

  // Validated against the old destination test url
  {
    key: 'storj',
    customKey: 'storjApiKey',
    displayName: $localize`Storj API Key`,
    description: $localize`Store backups in Storj API Key.`,
    icon: 'assets/dest-icons/storj.png',
    dynamicFields: [
      {
        name: 'storj-satellite',
        shortDescription: $localize`Satellite`,
        type: 'NonValidatedSelectableString',
        loadOptions: (injector) => injector.get(WebModulesService).getStorjSatellites(),
        isMandatory: true,
      },
      {
        name: 'storj-api-key',
        shortDescription: $localize`API Key`,
        isMandatory: true,
      },
      {
        name: 'storj-secret',
        shortDescription: $localize`Secret`,
        isMandatory: true,
      },
      {
        name: 'storj-bucket',
        type: 'Bucketname',
        shortDescription: $localize`Bucket`,
        isMandatory: true,
      },
      {
        name: 'storj-folder',
        type: 'Path',
        shortDescription: $localize`Path on server`,
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const obj = { 'storj-auth-method': 'API key' };
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic),
          ...Object.entries(obj),
        ]);

        return `storj://storj.io/config${urlParams}`;
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const fields = fromSearchParams('storjApiKey', urlObj);
        delete fields.advanced['storj-auth-method'];
        return <ValueOfDestinationFormGroup>{
          destinationType,
          ...fields,
        };
      },

      intercept: (urlObj: UrlLike): boolean => {
        if (urlObj.protocol !== 'storj:') return false;

        if (urlObj.searchParams.get('storj-api-key')) return true;
        if (urlObj.searchParams.get('storj-secret')) return true;
        if (urlObj.searchParams.get('storj-auth-method') === 'API key') return true;

        return false;
      },

      default: () => 'storj://?storj-api-key=&storj-secret=&storj-auth-method=API+key',
    },
  },

  // Validated against the old destination test url
  {
    key: 'aliyunoss',
    displayName: $localize`Aliyun OSS`,
    description: $localize`Store backups in Aliyun OSS`,
    icon: 'assets/dest-icons/aliyun.png',
    customFields: {
      bucket: {
        type: 'Bucketname',
        name: 'bucket',
        shortDescription: $localize`Bucket name`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
        isMandatory: true,
      },
      path: {
        type: 'Path',
        name: 'path',
        doubleSlash: DEFAULT_DOUBLESLASH_CONFIG,
        shortDescription: $localize`Path in bucket`,
        longDescription: $localize`Path in bucket`,
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'oss-endpoint',
        isMandatory: true,
      },
      {
        name: 'oss-access-key-id',
        isMandatory: true,
      },
      {
        name: 'oss-access-key-secret',
        isMandatory: true,
      },
    ],
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const { bucket, path } = fields.custom;
        const patched = {
          ...fields,
          advanced: {
            ...fields.advanced,
            'oss-bucket-name': bucket,
          },
        };

        return buildUrlFromFields(patched, null, null, path);
      },
      from: (destinationType: string, urlObj: UrlLike, plainPath: string) => {
        const searchParams = fromSearchParams(destinationType, urlObj);
        const bucket = searchParams.advanced['oss-bucket-name'];
        delete searchParams.advanced['oss-bucket-name'];

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: getSimplePath(urlObj),
            bucket: bucket,
          },
          ...searchParams,
        };
      },
    },
  },
  CreateCustomS3ProviderEntry('rabata', 'Rabata.io', null, 'assets/dest-icons/rabata.png', ['.rabata.io']),
  CreateCustomS3ProviderEntry('wasabi', 'Wasabi Hot Storage', null, 'assets/dest-icons/wasabi.png', ['.wasabisys.com']),
  CreateCustomS3ProviderEntry('impossiblecloud', 'Impossible Cloud', null, 'assets/dest-icons/impossiblecloud.png', [
    '.impossibleapi.net',
  ]),
  CreateCustomS3ProviderEntry('scaleway', 'Scaleway', null, 'assets/dest-icons/scaleway.png', ['.scw.cloud']),
  CreateCustomS3ProviderEntry('hosteurope', 'Hosteurope', null, 'assets/dest-icons/hosteurope.png', ['.hosteurope.de']),
  CreateCustomS3ProviderEntry('dunkel', 'Dunkel', null, 'assets/dest-icons/dunkel.png', ['.dunkel.de']),
  CreateCustomS3ProviderEntry('dreamhost', 'DreamHost', null, 'assets/dest-icons/dreamhost.png', ['.dreamhost.com']),
  CreateCustomS3ProviderEntry('dincloud', 'dinCloud', null, 'assets/dest-icons/dincloud.png', ['.dincloud.com']),
  CreateCustomS3ProviderEntry('polisystems', 'Poli Systems', null, 'assets/dest-icons/polisystems.png', [
    '.polisystems.ch',
  ]),
  CreateCustomS3ProviderEntry('ibmcos', 'IBM COS', null, 'assets/dest-icons/ibmcos.png', ['.softlayer.net']),
  CreateCustomS3ProviderEntry('storadera', 'Storadera', null, 'assets/dest-icons/storadera.png', ['.storadera.com']),
  CreateCustomS3ProviderEntry('infomaniak', 'Infomaniak', null, 'assets/dest-icons/infomaniak.png', [
    '.infomaniak.com',
    '.infomaniak.cloud',
  ]),
  CreateCustomS3ProviderEntry('sakuracloud', 'さくらのクラウド', null, 'assets/dest-icons/sakuracloud.png', [
    '.sakurastorage.jp',
  ]),
  CreateCustomS3ProviderEntry('seagatelyve', 'Seagate Lyve', null, 'assets/dest-icons/seagatelyve.png', [
    '.lyvecloud.seagate.com',
  ]),
];

export const S3_HOST_SUFFIX_MAP: Record<string, string> = {
  '.amazonaws.com': 'Amazon S3',
  '.impossibleapi.net': 'Impossible Cloud S3',
  '.scw.cloud': 'Scaleway S3',
  '.hosteurope.de': 'Hosteurope S3',
  '.dunkel.de': 'Dunkel S3',
  '.dreamhost.com': 'DreamHost S3',
  '.dincloud.com': 'dinCloud S3',
  '.polisystems.ch': 'Poli Systems S3',
  '.softlayer.net': 'IBM COS (S3)',
  '.storadera.com': 'Storadera S3',
  '.wasabisys.com': 'Wasabi S3',
  '.infomaniak.com': 'Infomaniak S3',
  '.infomaniak.cloud': 'Infomaniak S3',
  '.sakurastorage.jp': 'さくらのクラウド S3',
  '.lyvecloud.seagate.com': 'Seagate Lyve S3',
  '.digitaloceanspaces.com': 'DigitalOcean S3',
  '.backblazeb2.com': 'Backblaze B2 S3',
  '.cloudian.com': 'Cloudian S3',
  '.min.io': 'MinIO S3',
  '.linodeobjects.com': 'Linode S3',
  '.bunnycdn.com': 'BunnyCDN S3',
  '.azure.com': 'Microsoft Azure S3',
  '.googleapis.com': 'Google Cloud Storage S3',
  '.ibm.com': 'IBM Cloud S3',
  '.oracle.com': 'Oracle Cloud S3',
  '.cloudflare.com': 'Cloudflare S3',
  '.alibaba.com': 'Alibaba Cloud S3',
  '.huawei.com': 'Huawei Cloud S3',
  '.tencent.com': 'Tencent Cloud S3',
  '.baidu.com': 'Baidu Cloud S3',
  '.jd.com': 'JD Cloud S3',
  '.ucloud.cn': 'UCloud S3',
  '.qiniu.com': 'Qiniu Cloud S3',
  '.aliyuncs.com': 'Aliyun S3',
  '.tcloud.com': 'TCloud S3',
  '.tencentcloudapi.com': 'Tencent Cloud S3',
  '.rabata.io': 'Rabata S3',
};
