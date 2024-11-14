import { JsonPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleSelectComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { BackupState } from '../backup.state';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'] as const;
const EXPRESSION_OPTIONS = ['Contains', 'Does not contain', 'Is greater than', 'Is less than'] as const;

type ExpressionOptions = (typeof EXPRESSION_OPTIONS)[number];

const createExpressionGroup = () => {
  return fb.group({
    expressionOption: fb.control<ExpressionOptions>(EXPRESSION_OPTIONS[0]),
    expression: fb.nonNullable.control<string>('*'),
  });
};

type ExpressionGroup = ReturnType<typeof createExpressionGroup>;

export const createSourceDataForm = (
  defaults = {
    path: '',
    excludes: {
      hidden: false,
      system: false,
      temporary: false,
      filesLargerThan: null,
    },
  }
) => {
  return fb.group({
    path: fb.control<string>(defaults.path),
    excludes: fb.group({
      hidden: fb.control<boolean>(defaults.excludes.hidden),
      system: fb.control<boolean>(defaults.excludes.system),
      temporary: fb.control<boolean>(defaults.excludes.temporary),
      filesLargerThan: fb.group({
        size: fb.control<number | null>(null),
        unit: fb.control<string | null>(null),
      }),
    }),
  });
};

@Component({
  selector: 'app-source-data',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleSelectComponent,
    SparkleToggleComponent,
    FileTreeComponent,
    ToggleCardComponent,

    JsonPipe,
  ],
  templateUrl: './source-data.component.html',
  styleUrl: './source-data.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SourceDataComponent {
  #backupState = inject(BackupState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  sourceDataForm = this.#backupState.sourceDataForm;
  sourceDataFormSignal = this.#backupState.sourceDataFormSignal;

  filesLargerThan = computed(() => this.sourceDataFormSignal()?.excludes?.filesLargerThan?.size !== null);
  sizeOptions = signal(SIZE_OPTIONS);
  expressionOptions = signal(EXPRESSION_OPTIONS);

  getPath() {
    return this.sourceDataForm.value.path ?? null;
  }

  toggleFilesLargerThan() {
    if (this.sourceDataForm.controls.excludes.value.filesLargerThan?.size === null) {
      this.sourceDataForm.controls.excludes.controls.filesLargerThan.setValue({
        size: 50,
        unit: 'MB',
      });
    } else {
      this.sourceDataForm.controls.excludes.controls.filesLargerThan.setValue({
        size: null,
        unit: null,
      });
    }
  }

  goBack() {
    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }

  next() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }
}
