import { FormBuilder } from '@angular/forms';

const fb = new FormBuilder();

export const createSourceDataForm = (
  defaults = {
    path: '',
    filters: [],
    excludes: {
      filesLargerThan: null,
    },
  }
) => {
  return fb.group({
    path: fb.control<string>(defaults.path),
    excludes: fb.group({
      filesLargerThan: fb.group({
        size: fb.control<number | null>(null),
        unit: fb.control<string | null>(null),
      }),
    }),
  });
};

export type SourceDataFormValue = ReturnType<typeof createSourceDataForm>['value'];
