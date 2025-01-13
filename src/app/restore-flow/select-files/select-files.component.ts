import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleIconComponent,
  SparkleOptionComponent,
  SparkleProgressBarComponent,
  SparkleSelectComponent,
} from '@sparkle-ui/core';
import { derivedFrom } from 'ngxtension/derived-from';
import { finalize, map, of, pipe, startWith, switchMap } from 'rxjs';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { DuplicatiServerService } from '../../core/openapi';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreSelectFilesForm = () => {
  return fb.group({
    filesToRestore: fb.control<string>(''),
    selectedOption: fb.control<number | null>(null),
    passphrase: fb.control<string | null>(null),
  });
};

@Component({
  selector: 'app-select-files',
  imports: [
    ReactiveFormsModule,
    DatePipe,
    FileTreeComponent,
    SparkleButtonComponent,
    SparkleOptionComponent,
    SparkleIconComponent,
    SparkleSelectComponent,
    SparkleProgressBarComponent,
  ],
  templateUrl: './select-files.component.html',
  styleUrl: './select-files.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DatePipe],
})
export default class SelectFilesComponent {
  #dupServer = inject(DuplicatiServerService);
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #datePipe = inject(DatePipe);

  selectFilesForm = this.#restoreFlowState.selectFilesForm;
  selectFilesFormSignal = this.#restoreFlowState.selectFilesFormSignal;
  selectedOptionSignal = toSignal(this.selectFilesForm.controls.selectedOption.valueChanges);
  backupId = this.#restoreFlowState.backupId;
  versionOptionsLoading = this.#restoreFlowState.versionOptionsLoading;
  versionOptions = this.#restoreFlowState.versionOptions;
  isDraft = this.#restoreFlowState.isDraft;
  isFileRestore = this.#restoreFlowState.isFileRestore;
  backupSettings = computed(() => {
    const id = this.backupId();
    const selected = this.selectFilesFormSignal();
    const selectedOption = selected?.selectedOption ? parseInt(selected?.selectedOption as any) : null;

    if (!(typeof selectedOption === 'number') || !id) return null;

    const option = this.versionOptions()?.find((x) => x.Version === selectedOption);
    const time = option?.Time ?? null;

    if (!time) return null;

    return {
      id,
      time,
    };
  });

  isRepairing = signal(false);
  repairEffect = effect(() => {
    const isDraft = this.#restoreFlowState.isDraft();
    const newSelectedOption = this.selectedOptionSignal();

    if (isDraft && newSelectedOption) {
      const backupId = this.backupId();

      this.isRepairing.set(true);
      this.#dupServer
        .postApiV1BackupByIdRepairupdate({
          id: backupId!,
          requestBody: {
            only_paths: true,
            time: new Date().toISOString(),
          },
        })
        .pipe(finalize(() => this.isRepairing.set(false)))
        .subscribe();
    }
  });

  rootPathLoaded = signal(false);
  rootPath = derivedFrom(
    [this.selectFilesFormSignal, this.backupId],
    pipe(
      startWith([null, null]),
      switchMap(([selectFilesFormSignal, backupId]) => {
        const selectedOption = selectFilesFormSignal?.selectedOption
          ? parseInt(selectFilesFormSignal?.selectedOption as any)
          : null;
        const id = backupId;

        if (!(typeof selectedOption === 'number') || !id) return of('/');

        const option = this.versionOptions()?.find((x) => x.Version === selectedOption);

        return this.#dupServer
          .getApiV1BackupByIdFiles({
            id,
            time: option?.Time ?? '',
            prefixOnly: false,
            folderContents: true,
          })
          .pipe(
            map((x) => {
              this.rootPathLoaded.set(true);

              return (x['Files'] as any)[0].Path;
            })
          );
      })
    )
  );

  displayFn() {
    const options = this.versionOptions();

    return (val: string) => {
      if (!val) return '';

      const item = options?.find((x) => x.Version?.toString() === val);

      if (!item) {
        return '';
      }
      return `${item.Version}: ${this.#datePipe.transform(item.Time, 'd MMM y, h:mm')}`;
    };
  }

  next() {
    this.#router.navigate(['options'], { relativeTo: this.#route.parent });
  }

  back() {
    if (this.#restoreFlowState.isFileRestore()) {
      this.#router.navigate(['encryption'], { relativeTo: this.#route.parent });
    } else {
      this.#restoreFlowState.exit();
    }
  }
}
