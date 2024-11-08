import { FormBuilder, Validators } from '@angular/forms';
import { ArgumentType, ICommandLineArgument } from '../../core/openapi';

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export type FormView = {
  name: string;
  type: ArgumentType | 'FileTree' | 'FolderTree';
  accepts?: string;
  shortDescription?: string;
  longDescription?: string;
  options?: ICommandLineArgument['ValidValues'];
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
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
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
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
      port: {
        type: 'Integer',
        name: 'port',
        shortDescription: 'Port',
        longDescription: 'The port to connect to',
        formElement: (defaultValue?: any) =>
          fb.control<string>(defaultValue ?? '', [Validators.required, Validators.max(65535)]),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
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
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['use-ssl', 's3-server-name', 'auth-username', 'auth-password'],
  },
  gcs: {
    oauthField: 'authid',
    dynamicFields: ['gcs-location', 'gcs-storage-class', 'authid'],
  },
  googledrive: {
    oauthField: 'authid',
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'Folder path',
        longDescription: 'Folder path',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
  },
};
