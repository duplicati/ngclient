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

// TODO - Would be great to use the typing of the fields to validate the mapper if all fields are mapped
// TODO - deprecate the customFields just replace advancedFields if they come from the backend,
//        otherwise expect them as custom fields this way we can enforce order.
// TODO - add support for a server/port field type

export const DESTINATION_CONFIG: DestinationConfig = {
  file: {
    title: 'File system',
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
        const hasLeadingSlash = plainPath.indexOf('file:///') === 0;
        const hostNameCapitalFirstLetter =
          plainPath.split(hasLeadingSlash ? '///' : '//')[1].substring(0, 1) + urlObj.hostname.substring(1);

        return <ValueOfDestinationFormGroup>{
          destinationType,
          custom: {
            path: `${hasLeadingSlash ? '/' : ''}${hostNameCapitalFirstLetter}${urlObj.pathname}`,
          },
          ...fromSearchParams(destinationType, urlObj),
        };
      },
    },
  },
  ssh: {
    title: 'SSH',
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
  s3: {
    title: 'S3 compatible bucket',
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
        const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);

        return `${fields.destinationType}://${fields.custom.bucket}${fields.custom.path.startsWith('/') ? fields.custom.path : '/' + fields.custom.path}${urlParams}`;
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
  gcs: {
    title: 'Google Cloud Storage',
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
  googledrive: {
    title: 'Google Drive',
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
  azure: {
    title: 'Azure Blob Storage',
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
  onedrivev2: {
    title: 'OneDrive',
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
  // onedrivebusiness: {
  //   title: 'OneDrive Business',
  //   description: 'Store backups in OneDrive Business.',
  //   customFields: {
  //     server: {
  //       type: 'String',
  //       name: 'server',
  //       shortDescription: 'Server',
  //       longDescription: 'Server',
  //       formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
  //     },
  //     port: {
  //       type: 'Integer',
  //       name: 'port',
  //       shortDescription: 'Port',
  //       longDescription: 'Port',
  //       formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
  //     },
  //     path: {
  //       type: 'String',
  //       name: 'path',
  //       shortDescription: 'Path on server',
  //       longDescription: 'Path on server',
  //       formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
  //     },
  //   },
  //   dynamicFields: [
  //     {
  //       name: 'auth-username',
  //       shortDescription: 'Account name',
  //     },
  //     {
  //       name: 'auth-password',
  //       shortDescription: 'Access key',
  //     },
  //   ],
  //   mapper: {
  //     to: (fields: any): string => {
  //       const urlParams = toSearchParams([...Object.entries(fields.advanced), ...Object.entries(fields.dynamic)]);
  //       const { port, server, path } = fields.custom;

  //       return `${fields.destinationType}://${server + addPort(port) + addPath(path) + urlParams}`;
  //     },
  //     from: (destinationType: string, urlObj: URL, plainPath: string) => {
  //       return <ValueOfDestinationFormGroup>{
  //         destinationType,
  //         custom: {
  //           server: urlObj.hostname,
  //           port: urlObj.port,
  //           path: urlObj.pathname,
  //         },
  //         ...fromSearchParams(destinationType, urlObj),
  //       };
  //     },
  //   },
  // },
  dropbox: {
    title: 'Dropbox',
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
  box: {
    title: 'Box.com',
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
  jottacloud: {
    title: 'Jottacloud',
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
};
