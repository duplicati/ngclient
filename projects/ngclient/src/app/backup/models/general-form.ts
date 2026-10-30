import { FormBuilder, Validators } from '@angular/forms';
import { OperationType } from '../../core/openapi';
import { validateWhen, watchField } from '../../core/validators/custom.validators';

const fb = new FormBuilder();

export const createGeneralForm = (
  defaults = {
    name: '',
    description: '',
    encryption: '',
    password: '',
    repeatPassword: '',
    compression: '',
    operationType: 'Backup' as OperationType,
  }
) => {
  return fb.group({
    name: fb.control<string>(defaults.name, [Validators.required]),
    description: fb.control<string>(defaults.description),
    encryption: fb.control<string>(defaults.encryption, [watchField()]),
    password: fb.control<string>(defaults.password, [
      validateWhen((t) => t?.value.encryption !== '-', [Validators.required]),
    ]),
    repeatPassword: fb.control<string>(defaults.repeatPassword, [
      validateWhen((t) => t?.value.encryption !== '-', [Validators.required]),
    ]),
    operationType: fb.control<OperationType>(defaults.operationType),
  });
};

export const NONE_OPTION = {
  Key: '-',
  DisplayName: 'None',
};

export type GeneralFormValue = ReturnType<typeof createGeneralForm>['value'];
