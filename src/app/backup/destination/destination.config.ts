import { Injector, Signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { ArgumentType, ICommandLineArgument } from '../../core/openapi';
import { WebModuleOption, WebModulesService } from '../../core/services/webmodules.service';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

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

export type DestinationConfig = {
  [key: string]: {
    oauthField?: string;
    customFields?: {
      [key: string]: CustomFormView;
    };
    dynamicFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
    advancedFields?: (string | WithRequired<Partial<CustomFormView>, 'name'>)[];
    ignoredAdvancedFields?: string[];
  };
};

const fb = new FormBuilder();

export const DESTINATION_CONFIG: DestinationConfig = {
  file: {
    customFields: {
      path: {
        type: 'FolderTree',
        name: 'path',
        shortDescription: 'File path',
        longDescription: 'The path to store the backup',
        formElement: (defaultValue?: string) => fb.control<string>(defaultValue ?? ''),
      },
    },
  },
  ssh: {
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
    // ignoredAdvancedFields: ['ssh-key'],
  },
  s3: {
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
  },
  gcs: {
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
  },
  googledrive: {
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
  },
};
