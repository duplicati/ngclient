import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';

@Component({
  selector: 'app-target-disk-dialog',
  imports: [ShipButton, FileTreeComponent, FormsModule],
  templateUrl: './target-disk-dialog.html',
  styleUrl: './target-disk-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TargetDiskDialog {
  data = input<{
    initialPath: string | null;
  }>();
  closed = output<string | null>();

  path = signal<string>('');
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
