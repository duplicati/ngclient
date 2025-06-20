import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  SparkleButtonComponent,
  SparkleIconComponent,
  SparkleRadioComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { RestoreFlowState } from '../restore-flow.state';

const fb = new FormBuilder();

export const createRestoreOptionsForm = () => {
  return fb.group({
    restoreFrom: fb.control<'orignal' | 'pickLocation'>('orignal'),
    restoreFromPath: fb.control<string>(''),
    handleExisting: fb.control<'overwrite' | 'saveTimestamp'>('overwrite'),
    permissions: fb.control<boolean>(false),
    includeMetadata: fb.control<boolean>(true),
  });
};

@Component({
    selector: 'app-advanced-options-settings',
    imports: [
        ReactiveFormsModule,
        ToggleCardComponent,
        FileTreeComponent,
        SparkleToggleComponent,
        SparkleRadioComponent,
        SparkleButtonComponent,
        SparkleIconComponent,
    ],
    templateUrl: './options.component.html',
    styleUrl: './options.component.scss',
    changeDetection: ChangeDetectionStrategy.OnPush
})
export default class OptionsComponent {
  #restoreFlowState = inject(RestoreFlowState);
  #router = inject(Router);
  #route = inject(ActivatedRoute);

  optionsForm = this.#restoreFlowState.optionsForm;
  optionsFormSignal = this.#restoreFlowState.optionsFormSignal;
  isSubmitting = this.#restoreFlowState.isSubmitting;

  goBack() {
    this.#router.navigate(['select-files'], { relativeTo: this.#route.parent });
  }

  submit() {
    this.#restoreFlowState.submit();
  }
}
