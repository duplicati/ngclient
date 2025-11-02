import { FormView } from '../../destination/destination.config-utilities';

// This is a list of FormView overrides for specific options used in the options list component.
export const OPTIONS_LIST_CUSTOM_CONFIG: FormView[] = [
  {
    name: 'send-mail-to',
    type: 'Email',
  },
  {
    name: 'send-mail-from',
    type: 'Email',
  },
  {
    name: 'log-file',
    type: 'FileTree',
  },
  {
    name: 'compression-extension-file',
    type: 'FileTree',
  },
  {
    name: 'dbpath',
    type: 'FileTree',
  },
  {
    name: 'restore-path',
    type: 'FileTree',
  },
  {
    name: 'gpg-program-path',
    type: 'FileTree',
    // accepts: '.exe,.bin,.sh', //TODO: Support binary without extension?
  },
];
