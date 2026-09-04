import { AbstractControl, FormArray, FormGroup, ValidationErrors, ValidatorFn } from '@angular/forms';

export function validateWhen(
  predicate: (parent: FormGroup | FormArray) => boolean,
  validators: ValidatorFn | ValidatorFn[],
  errorNamespace = 'conditional'
): ValidatorFn {
  return (control: AbstractControl) => {
    if (!control.parent) {
      return null;
    }

    let error: ValidationErrors | null = null;

    if (predicate(control.parent)) {
      const validatorArr = Array.isArray(validators) ? validators : [validators];

      for (const validator of validatorArr) {
        const validationResult = validator(control);

        if (validationResult !== null) {
          error = validationResult;
          break;
        }
      }
    }

    if (errorNamespace && error) {
      const customError: ValidationErrors = {};
      customError[errorNamespace] = error;
      error = customError;
    }

    return error as ValidationErrors | null;
  };
}

export function watchField() {
  return (control: AbstractControl): null => {
    const parent = control.parent;

    if (!parent) {
      return null;
    }

    queueMicrotask(() => {
      Object.values(parent.controls).forEach((ctrl) => {
        if (ctrl !== control) {
          ctrl.updateValueAndValidity();
        }
      });
    });

    return null;
  };
}

export function validateIf<T>(
  conditionalFieldName: string,
  conditionalValue: T | T[],
  validators: ValidatorFn | ValidatorFn[],
  errorNamespace = 'conditional'
): ValidatorFn {
  return (control: AbstractControl) => {
    if (!control.parent) {
      return null;
    }

    let error: ValidationErrors | null = null;

    const conditionalFormCtrl = control.parent.get(conditionalFieldName);

    if (!conditionalFormCtrl) {
      console.warn('Conditional field not found');
      return null;
    }

    const isConditionalValueArray = Array.isArray(conditionalValue);

    if (
      isConditionalValueArray
        ? conditionalValue.includes(conditionalFormCtrl.value)
        : conditionalFormCtrl.value === conditionalValue
    ) {
      const validatorArr = Array.isArray(validators) ? validators : [validators];
      for (const validator of validatorArr) {
        const validationResult = validator(control);

        if (validationResult !== null) {
          error = validationResult;
          break;
        }
      }
    }

    return error;
  };
}

export function accumulatedMax(conditionalValue: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors => {
    let error: { accumulatedMax: string } | ValidationErrors = {};

    const accumulatedControlValue = control.value.reduce((a: number, b: number) => a + b, 0);

    if (accumulatedControlValue > conditionalValue) {
      error = {
        accumulatedMax: `Total page count exceeds the maximum (${conditionalValue}) count.`,
      };
    }

    return error;
  };
}

export function accumulatedMin(conditionalValue: number): ValidatorFn {
  return (control: AbstractControl): ValidationErrors => {
    let error: { accumulatedMax: string } | ValidationErrors = {};

    const accumulatedControlValue = control.value.reduce((a: number, b: number) => a + b, 0);

    if (accumulatedControlValue < conditionalValue) {
      error = {
        accumulatedMin: `Total page count exceeds the minimum (${conditionalValue}) count.`,
      };
    }

    return error;
  };
}
