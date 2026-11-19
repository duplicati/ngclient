import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { form, FormField } from '@angular/forms/signals';
import { ShipButton } from '@ship-ui/core/ship-button';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';

@Component({
  selector: 'app-target-disk-dialog',
  imports: [ShipButton, FileTreeComponent, FormField],
  templateUrl: './target-disk-dialog.html',
  styleUrl: './target-disk-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetDiskDialog {
  data = input<{
    initialPath: string | null;
  }>();
  closed = output<string | null>();

  inputForm = form(signal({ path: '' as string }));
  path = this.inputForm.path().value;
  isValid = computed(() => this.path().length > 0);

  dataEffect = effect(() => {
    const data = this.data();

    if (data?.initialPath) {
      this.path.set(data.initialPath);
    }
  });

  submit() {
    this.closed.emit(this.path() || null);
  }
}
