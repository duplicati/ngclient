import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
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
import { FilterComponent } from './filter/filter.component';

const fb = new FormBuilder();
const SIZE_OPTIONS = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

export const createSourceDataForm = (
  defaults = {
    path: '',
    filters: [],
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
  imports: [
    FormsModule,
    ReactiveFormsModule,
    SparkleFormFieldComponent,
    SparkleIconComponent,
    SparkleButtonComponent,
    SparkleToggleComponent,
    SparkleSelectComponent,
    FileTreeComponent,
    ToggleCardComponent,
    FilterComponent,
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

  newPathCtrl = new FormControl('');
  filesLargerThan = computed(() => this.sourceDataFormSignal()?.excludes?.filesLargerThan?.size !== null);
  sizeOptions = signal(SIZE_OPTIONS);
  osType = this.#backupState.osType;

  pathSignal = toSignal(this.sourceDataForm.controls.path.valueChanges);
  pathArray = computed(
    () =>
      (this.pathSignal()
        ?.split('\0')
        .filter((x) => x.startsWith('-') || x.startsWith('+') || x === '___none___') as string[]) ?? []
  );

  addFilter(newPath = '-*') {
    const currentPath = this.sourceDataForm.controls.path.value;
    this.sourceDataForm.controls.path.setValue(`${currentPath!}\0${newPath}`);
  }

  patchPathAt(newPath: string, index: number) {
    const currentPath = this.sourceDataForm.controls.path.value;
    const nonFilterPath = currentPath!
      .split('\0')
      .filter((x) => !x.startsWith('-') && !x.startsWith('+'))
      .join('\0');

    const _newPath = this.pathArray()
      .map((x, i) => (i === index ? `${newPath}` : `${x}`))
      .join('\0');

    this.sourceDataForm.controls.path.setValue(`${nonFilterPath}\0${_newPath}`);
  }

  removePathAt(index: number) {
    const currentPath = this.sourceDataForm.controls.path.value;
    const nonFilterPath = currentPath!
      .split('\0')
      .filter((x) => !x.startsWith('-') && !x.startsWith('+'))
      .join('\0');

    const _newPath = this.pathArray()
      .filter((_, i) => i !== index)
      .join('\0');

    this.sourceDataForm.controls.path.setValue(`${nonFilterPath}\0${_newPath}`);
  }

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

  addNewPath() {
    const currentPath = this.sourceDataForm.controls.path.value;
    const newPath = this.newPathCtrl.value;

    // TODO - Add path validation

    this.sourceDataForm.controls.path.setValue(`${currentPath}\0${newPath}`);
    this.newPathCtrl.setValue('');
  }

  goBack() {
    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }

  next() {
    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }
}
