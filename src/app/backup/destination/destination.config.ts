import { signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { WebModulesService } from '../../core/services/webmodules.service';
import {
  addPath,
  addPort,
  DestinationConfig,
  fromSearchParams,
  toSearchParams,
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

export const DESTINATION_CONFIG: DestinationConfig = [
  {
    key: 'file',
    displayName: 'File system',
    description: 'Store backups on your local file system.',
    customFields: {
      path: {
        type: 'FolderTree',
        name: 'path',
        shortDescription: 'File path',
        longDescription: 'The path to store the backup',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    mapper: {
      to: (fields: ValueOfDestinationFormGroup): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${fields.custom.path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        const hasLeadingSlash = plainPath.startsWith('file:///');
        const _tempPath = hasLeadingSlash ? plainPath.split('file:///')[1] : plainPath.split('file://')[1];
        const isShortcut = _tempPath.startsWith('%');
        const path = isShortcut ? _tempPath : '/' + _tempPath;

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'ssh',
    displayName: 'SSH',
    description: 'Store backups in SSH.',
    customFields: {
      server: {
        type: 'String', // Custom server/port field
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'The server to connect to',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'The port to connect to',
        formElement: (defaultValue?: string) =>
          fb.control<string>(defaultValue ?? '', [Validators.required, Validators.max(65535)]),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['auth-username'],
    advancedFields: [
      {
        type: 'FileTree',
        name: 'ssh-keyfile',
        accepts: '.key,',
        shortDescription: 'This is a path to a private key file locally on the machine',
        longDescription: 'This is a path to a private key file locally on the machine',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
        const { port, server, path } = fields.custom;

        return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 's3',
    displayName: 'S3 compatible bucket',
    description: 'Store backups in any S3 compatible bucket.',
    customFields: {
      bucket: {
        type: 'String',
        name: 'bucket',
        shortDescription: 'Bucket name',
        longDescription: 'Bucket name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 's3-server-name',
        shortDescription: 'Server',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).s3Providers,
      },
      'use-ssl',
      'auth-username',
      'auth-password',
    ],
    advancedFields: [
      {
        name: 's3-client',
        type: 'Enumeration', // Convert to string before submitting
        options: ['aws', 'minio'],
      },
      {
        name: 's3-storage-class',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).s3StorageClasses,
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const { bucket, path } = fields.custom;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${bucket + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.pathname,
            bucket: urlObj.hostname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'gcs',
    displayName: 'Google Cloud Storage',
    description: 'Store backups in Google Cloud Storage.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Bucket name',
        longDescription: 'Bucket name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'gcs-location',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).gcsLocations,
      },
      {
        name: 'gcs-storage-class',
        type: 'NonValidatedSelectableString', // Convert to string before submitting
        loadOptions: (injector) => injector.get(WebModulesService).gcsStorageClasses,
      },
      'authid',
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${fields.custom.path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'googledrive',
    displayName: 'Google Drive',
    description: 'Store backups in Google Drive.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any): string => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'pcloud',
    displayName: 'pCloud',
    description: 'Store backups in pCloud.',
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
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any): string => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        const pathWithoutPrefixSlash = urlObj.pathname.replace(/^\//, '');

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            path: pathWithoutPrefixSlash,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'azure',
    displayName: 'Azure Blob Storage',
    description: 'Store backups in Azure Blob Storage.',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Container name',
        longDescription: 'Container name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Account name',
      },
      {
        name: 'auth-password',
        shortDescription: 'Access key',
      },
    ],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'onedrivev2',
    displayName: 'OneDrive',
    description: 'Store backups in OneDrive.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'od4b',
    displayName: 'OneDrive Business',
    description: 'Store backups in OneDrive Business.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Account name',
      },
      {
        name: 'auth-password',
        shortDescription: 'Access key',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
        const { port, server, path } = fields.custom;

        return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'mssp',
    displayName: 'Microsoft SharePoint',
    description: 'Store backups in Microsoft SharePoint.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Account name',
      },
      {
        name: 'auth-password',
        shortDescription: 'Access key',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
        const { port, server, path } = fields.custom;

        return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'sharepoint',
    displayName: 'Microsoft SharePoint v2',
    description: 'Store backups in Microsoft SharePoint.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'dropbox',
    displayName: 'Dropbox',
    description: 'Store backups in Dropbox.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'box',
    displayName: 'Box.com',
    description: 'Store backups in Box.com.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'jottacloud',
    displayName: 'Jottacloud',
    description: 'Store backups in Jottacloud.',
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'b2',
    displayName: 'B2 Cloud Storage',
    description: 'Store backups in B2 Cloud Storage.',
    customFields: {
      bucket: {
        type: 'String',
        name: 'bucket',
        shortDescription: 'Bucket name',
        longDescription: 'Bucket name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path in the bucket',
        longDescription: 'Path in the bucket',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Application ID',
      },
      {
        name: 'auth-password',
        shortDescription: 'Application Key',
      },
    ],
    mapper: {
      to: (fields: any) => {
        const { bucket, path } = fields.custom;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${bucket + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            bucket: urlObj.hostname,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'e2',
    displayName: 'IDrive e2',
    description: 'Store backups in IDrive e2.',
    customFields: {
      bucket: {
        type: 'String',
        name: 'bucket',
        shortDescription: 'Bucket name',
        longDescription: 'Bucket name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path in the bucket',
        longDescription: 'Path in the bucket',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Access ID',
      },
      {
        name: 'auth-password',
        shortDescription: 'Access Secret',
      },
    ],
    mapper: {
      to: (fields: any) => {
        const { bucket, path } = fields.custom;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${bucket + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            bucket: urlObj.hostname,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'mega',
    displayName: 'Mega.nz',
    description: 'Store backups in Mega.nz.',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Username',
      },
      {
        name: 'auth-password',
        shortDescription: 'Password',
      },
    ],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'msgroup',
    displayName: 'Microsoft Office 365 Group',
    description: 'Store backups in Microsoft Office 365 Group.',
    oauthField: 'authid',
    customFields: {
      groupEmail: {
        type: 'Email',
        name: 'groupEmail',
        shortDescription: 'Group email',
        longDescription: 'Group email',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? '', [Validators.email]),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
    mapper: {
      to: (fields: any) => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${path}${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.hostname + urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'cloudfiles',
    displayName: 'Rackspace CloudFiles',
    description: 'Store backups in Rackspace CloudFiles.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Username',
      },
      {
        name: 'auth-password',
        shortDescription: 'Password',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
        const { port, server, path } = fields.custom;

        return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'rclone',
    displayName: 'Rclone',
    description: 'Store backups in Rclone.',
    dynamicFields: [
      {
        name: 'rclone-local-repository',
        shortDescription: 'Local repository',
        defaultValue: '',
      },
      {
        name: 'rclone-remote-repository',
        shortDescription: 'Remote repository',
        defaultValue: '',
      },
      {
        name: 'rclone-remote-path',
        shortDescription: 'Path on remote repository',
        defaultValue: '',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const rcloneRemoteRepository = fields.dynamic['rclone-remote-repository'];
        const rcloneRemotePath = fields.dynamic['rclone-remote-path'];
        const rest = Object.entries(fields.dynamic).filter(
          ([key]) => !['rclone-remote-repository', 'rclone-remote-path'].includes(key)
        );

        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...rest]);

        return `${fields.destinationType}://${rcloneRemoteRepository}/${rcloneRemotePath + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        const { advanced, dynamic } = fromSearchParams(destinationType, urlObj);

        return <ValueOfDestinationFormGroup>{
          destinationType,
          dynamic: {
            'rclone-remote-repository': urlObj.hostname,
            'rclone-remote-path': urlObj.pathname,
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
    displayName: 'OpenStack Object Storage',
    description: 'Store backups in OpenStack Object Storage.',
    customFields: {
      bucket: {
        type: 'String',
        name: 'bucket',
        shortDescription: 'Bucket',
        longDescription: 'Bucket',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'openstack-authuri',
        shortDescription: 'Auth URI',
        type: 'Enumeration',
        loadOptions: (injector) => injector.get(WebModulesService).openstackProviders,
      },
      {
        name: 'openstack-version',
        shortDescription: 'Version',
        type: 'Enumeration',
        loadOptions: (injector) => injector.get(WebModulesService).openstackVersions,
      },
      {
        name: 'openstack-domain-name',
        shortDescription: 'Domain name',
      },
      {
        name: 'openstack-tenant-name',
        shortDescription: 'Tenant name',
      },
      {
        name: 'openstack-region',
        shortDescription: 'Region',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
        const { bucket } = fields.custom;

        return `${fields.destinationType}://${bucket + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.pathname,
            bucket: urlObj.hostname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'webdav',
    displayName: 'WebDAV',
    description: 'Store backups in WebDAV.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'use-ssl',
        shortDescription: 'Use SSL',
      },
      {
        name: 'auth-username',
        shortDescription: 'Username',
      },
      {
        name: 'auth-password',
        shortDescription: 'Password',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const { port, server, path } = fields.custom;
        const useSsl = fields.dynamic['use-ssl'];
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'use-ssl'),
        ]);

        return `${fields.destinationType}${useSsl ? 's' : ''}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  {
    key: 'aftp',
    displayName: 'FTP',
    description: 'Store backups in FTP.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'auth-username',
        shortDescription: 'Username',
      },
      {
        name: 'auth-password',
        shortDescription: 'Password',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const { port, server, path } = fields.custom;
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'use-ssl'),
        ]);

        return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'sia',
    displayName: 'Sia Decentrilized Cloud',
    description: 'Store backups in Sia Decentrilized Cloud.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['sia-targetpath', 'sia-password', 'sia-redundancy'],
    mapper: {
      to: (fields: any): string => {
        const server = fields.custom.server;
        const targetpath = fields.dynamic['sia-targetpath'];
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'sia-targetpath'),
        ]);

        return `${fields.destinationType}://${server + addPath(targetpath) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'cos',
    displayName: 'Tencent COS',
    description: 'Store backups in Tencent COS.',
    customFields: {
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'cos-bucket',
        shortDescription: 'Bucket',
        order: 1,
      },
      {
        name: 'cos-region',
        shortDescription: 'Region',
        order: 2,
      },
      {
        name: 'cos-app-id',
        shortDescription: 'COS App Id',
        order: 3,
      },
      {
        name: 'cos-secret-id',
        shortDescription: 'COS Secret Id',
        order: 4,
      },
      {
        name: 'cos-secret-key',
        shortDescription: 'COS Secret Key',
        order: 5,
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const path = fields.custom.path;
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'cos-targetpath'),
        ]);

        return `${fields.destinationType}://${path + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'tahoe',
    displayName: 'Tahoe LAFS',
    description: 'Store backups in Tahoe LAFS.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'Port',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      username: {
        type: 'String',
        name: 'username',
        shortDescription: 'Username',
        longDescription: 'Username',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      password: {
        type: 'Password',
        name: 'password',
        shortDescription: 'Password',
        longDescription: 'Password',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: [
      {
        name: 'use-ssl',
        shortDescription: 'Use SSL',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const { port, server, path, username, password } = fields.custom;
        const obj = {
          ['auth-username']: username,
          ['auth-password']: password,
        };
        const useSsl = fields.dynamic['use-ssl'];
        const urlParams = toSearchParams([
          ...Object.entries(fields.advanced),
          ...Object.entries(fields.dynamic).filter(([key]) => key !== 'use-ssl'),
          ...Object.entries(obj),
        ]);

        return `${fields.destinationType}${useSsl ? 's' : ''}://${server + addPort(port) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            port: urlObj.port,
            path: urlObj.pathname,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  {
    key: 'cifs',
    displayName: 'CIFS',
    description: 'Store backups in CIFS.',
    customFields: {
      server: {
        type: 'String',
        name: 'server',
        shortDescription: 'Server',
        longDescription: 'Server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      share: {
        type: 'String',
        name: 'share',
        shortDescription: 'Share Name',
        longDescription: 'Share Name',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'String',
        name: 'path',
        shortDescription: 'Path on server',
        longDescription: 'Path on server',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['transport', 'auth-username', 'auth-password', 'auth-domain'],
    mapper: {
      to: (fields: any): string => {
        const { share, server, path, username, password } = fields.custom;
        const obj = {
          ['auth-username']: username,
          ['auth-password']: password,
        };
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(obj)]);

        return `${fields.destinationType}://${server + addPath(share) + addPath(path) + urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        const share = urlObj.pathname.split('/')[1];
        const path = urlObj.pathname.split('/').slice(2).join('/');

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            server: urlObj.hostname,
            share,
            path,
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
    displayName: 'Storj Access Grant',
    description: 'Store backups in Storj Access Grant.',
    dynamicFields: [
      {
        name: 'storj-shared-access',
        shortDescription: 'Access Grant',
      },
      {
        name: 'storj-bucket',
        shortDescription: 'Bucket',
      },
      {
        name: 'storj-folder',
        shortDescription: 'Path on server',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)], true);

        return `storj://storj.io/config?storj-auth-method=Access%20grant&storj-satellite=us1.storj.io%3A7777&storj-api-key&storj-secret&${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },

  // Validated against the old destination test url
  {
    key: 'storj',
    customKey: 'storjApiKey',
    displayName: 'Storj API Key',
    description: 'Store backups in Storj API Key.',
    dynamicFields: [
      {
        name: 'storj-satellite',
        shortDescription: 'Satellite',
        type: 'Enumeration',
        loadOptions: (injector) => injector.get(WebModulesService).storjSatellites,
      },
      {
        name: 'storj-api-key',
        shortDescription: 'API Key',
      },
      {
        name: 'storj-secret',
        shortDescription: 'Secret',
      },
      {
        name: 'storj-bucket',
        shortDescription: 'Bucket',
      },
      {
        name: 'storj-folder',
        shortDescription: 'Path on server',
      },
    ],
    mapper: {
      to: (fields: any): string => {
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)], true);

        return `storj://storj.io/config?storj-auth-method=API%20key&${urlParams}`;
      },
      from: (destinationType: string, urlObj: URL, plainPath: string) => {
        return <ValueOfDestinationFormGroup>{
          destinationType,
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
];
