import { FormBuilder, Validators } from '@angular/forms';
import { OperationType } from '../../core/openapi';
import { validateWhen, watchField } from '../../core/validators/custom.validators';

const fb = new FormBuilder();

export const createGeneralForm = (
  defaults = {
    name: '',
    encryption: '',
    password: '',
    repeatPassword: '',
    compression: '',
  }
) => {
  return fb.group({
    name: fb.control<string>(defaults.name, [Validators.required]),
    encryption: fb.control<string>(defaults.encryption, [watchField()]),
    password: fb.control<string>(defaults.password, [
      validateWhen((t) => t?.value.encryption !== '-', [Validators.required]),
    ]),
    repeatPassword: fb.control<string>(defaults.repeatPassword, [
      validateWhen((t) => t?.value.encryption !== '-', [Validators.required]),
    ]),
  });
};

export const NONE_OPTION = {
  Key: '-',
  DisplayName: 'None',
};

export type GeneralFormValue = ReturnType<typeof createGeneralForm>['value'] & { operationType?: OperationType | null };
