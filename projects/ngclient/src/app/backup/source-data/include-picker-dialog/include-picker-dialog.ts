import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import FileTreeComponent from '../../../core/components/file-tree/file-tree.component';
import { findIncludePick, includePickPrefix, isFilterPath } from '../../../core/components/file-tree/include-pick';

export type IncludePickerDialogData = {
  /** The source folder to pick from: a path with its trailing separator, or a shortcut token such as %HOME%. */
  folder: string;
  /** The current source paths and filters of the backup. */
  paths: string[];
  backupId: string | null;
  /** The directory separator of the server, used after a shortcut token. */
  separator: string;
  /** The @mount|url source entry when the folder is the mount of a remote source. */
  remoteSource?: string | null;
};

export type IncludePickerResult = {
  /** Picked files and folders, as full paths. Picking the folder itself means everything. */
  picks: string[];
  /** Paths inside picked folders that stay excluded. */
  excludes: string[];
};

/**
 * Lets the user tick the entries of a folder that should be backed up. The tree inside the dialog
 * is an ordinary multi-select tree rooted at the folder: ticked entries are its sources, and an entry
 * un-ticked below a ticked folder is an exclude. The source page turns the result into filters.
 */
@Component({
  selector: 'app-include-picker-dialog',
  imports: [ShipButton, ShipIcon, FileTreeComponent, FormsModule],
  templateUrl: './include-picker-dialog.html',
  styleUrl: './include-picker-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IncludePickerDialog {
  data = input<IncludePickerDialogData>();
  closed = output<IncludePickerResult | null>();

  folder = computed(() => this.data()?.folder ?? '');
  // The tree lists a shortcut's entries under "%TOKEN%/", so that is where the tree is rooted
  rootPaths = computed(() => {
    const data = this.data();
    return data?.folder ? [includePickPrefix(data.folder, data.separator)] : [];
  });
  backupId = computed(() => this.data()?.backupId ?? null);
  remoteSource = computed(() => this.data()?.remoteSource ?? null);

  // The tree's value: picks as plain paths, excludes as -paths, joined with \0
  path = signal<string>('');
  // The current pick as the tree's value
  existingValue = computed<string | null>(() => {
    const data = this.data();
    if (!data) return null;
    const existing = findIncludePick(data.paths, data.folder);
    const value = existing ? [...existing.picks, ...existing.excludes.map((x) => `-${x}`)].join('\0') : '';
    return value === '' ? null : value;
  });
  // A starting path makes the tree load every folder on the way to the picks, which only works
  // for local paths; a remote root is listed through its source instead and shows the picks as they load
  initialPath = computed(() => (this.remoteSource() ? null : this.existingValue()));

  selection = computed<IncludePickerResult>(() => {
    const entries = this.path()
      .split('\0')
      .filter((x) => x !== '');
    return {
      picks: entries.filter((x) => !isFilterPath(x)),
      excludes: entries.filter((x) => x.startsWith('-')).map((x) => x.slice(1)),
    };
  });
  pickCount = computed(() => this.selection().picks.length);
  everythingPicked = computed(() => this.selection().picks.includes(this.folder()));
  canApply = computed(() => this.pickCount() > 0);

  dataEffect = effect(() => {
    const existing = this.existingValue();
    if (existing !== null) this.path.set(existing);
  });

  includeEverything() {
    this.closed.emit({ picks: [this.folder()], excludes: [] });
  }

  submit() {
    if (!this.canApply()) return;
    this.closed.emit(this.selection());
  }
}
