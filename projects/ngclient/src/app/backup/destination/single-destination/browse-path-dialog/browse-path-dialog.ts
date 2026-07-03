import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core';
import FileTreeComponent from '../../../../core/components/file-tree/file-tree.component';

@Component({
  selector: 'app-browse-path-dialog',
  imports: [ShipButton, FileTreeComponent, FormsModule],
  templateUrl: './browse-path-dialog.html',
  styleUrl: './browse-path-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrowsePathDialog {
  data = input<{
    destinationUrl: string | null;
    backupId: string | null;
    connectionStringId: number | null;
  }>();
  closed = output<string | null>();

  path = signal<string>('');
  destinationUrl = signal<string>('');
  backupId = signal<string>('');
  connectionStringId = signal<number | null>(null);
  isValid = computed(() => this.path().length > 0);

  dataEffect = effect(() => {
    const data = this.data();

    if (data?.destinationUrl) {
      this.destinationUrl.set(data.destinationUrl);
    }
    if (data?.backupId) {
      this.backupId.set(data.backupId);
    }
    if (data?.connectionStringId) {
      this.connectionStringId.set(data.connectionStringId);
    }
  });

  submit() {
    this.closed.emit(this.path() || null);
  }
}
