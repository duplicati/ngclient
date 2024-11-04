import { FormBuilder, Validators } from '@angular/forms';
import { ArgumentType, ICommandLineArgument } from '../../core/openapi';

export type FormView = {
  name: string;
  type: ArgumentType | 'file-tree';
  shortDescription?: string;
  longDescription?: string;
  options?: ICommandLineArgument['ValidValues'];
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
    dynamicFields?: string[];
    advancedFields?: string[];
  };
};

const fb = new FormBuilder();

export const DESTINATION_CONFIG: DestinationConfig = {
  file: {
    customFields: {
      path: {
        type: 'file-tree',
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
        type: 'String',
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
        shortDescription: 'File path on the server',
        longDescription: 'File path on the server',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['auth-username'],
  },
  s3: {
    customFields: {
      path: {
        type: 'Path',
        name: 'path',
        shortDescription: 'File path on the server',
        longDescription: 'File path on the server',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
      bucket: {
        type: 'String',
        name: 'bucket',
        shortDescription: 'Bucket name',
        longDescription: 'Bucket name',
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
        shortDescription: 'File path on the server',
        longDescription: 'File path on the server',
        formElement: (defaultValue?: any) => fb.control<string>(defaultValue ?? ''),
      },
    },
    dynamicFields: ['authid'],
  },
};
