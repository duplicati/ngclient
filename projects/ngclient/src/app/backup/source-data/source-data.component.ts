import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton, ShipChip, ShipDialogService, ShipFormField, ShipIcon, ShipMenu, ShipToggle } from '@ship-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { SizeComponent, splitSize } from '../../core/components/size/size.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { DestinationConfigState } from '../../core/states/destinationconfig.state';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { getConfigurationByUrl } from '../destination/destination.config-utilities';
import { NewFilterComponent } from './new-filter/new-filter.component';
import { TargetUrlDialog } from './target-url-dialog/target-url-dialog';

const fb = new FormBuilder();

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
    ShipFormField,
    ShipIcon,
    ShipButton,
    ShipToggle,
    ShipMenu,
    NewFilterComponent,
    FileTreeComponent,
    ToggleCardComponent,
    SizeComponent,
    ShipChip,
  ],
  templateUrl: './source-data.component.html',
  styleUrl: './source-data.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export default class SourceDataComponent {
  #backupState = inject(BackupState);
  #dialog = inject(ShipDialogService);
  #router = inject(Router);
  #route = inject(ActivatedRoute);
  #sysInfo = inject(SysinfoState);
  #destinationConfigState = inject(DestinationConfigState);
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  sourceDataForm = this.#backupState.sourceDataForm;
  sourceDataFormSignal = this.#backupState.sourceDataFormSignal;

  newPathCtrl = new FormControl('');
  filesLargerThan = computed(() => {
    const el = this.sourceDataFormSignal()?.excludes?.filesLargerThan ?? {};
    return el.size !== null && el.unit !== null ? `${el.size}${el.unit}` : null;
  });
  osType = this.#backupState.osType;

  pathSignal = toSignal(this.sourceDataForm.controls.path.valueChanges);
  pathArray = computed(
    () =>
      (this.pathSignal()
        ?.split('\0')
        .filter((x) => x.startsWith('-') || x.startsWith('+') || x === '___none___') as string[]) ?? []
  );
  nonFilterPaths = computed(() =>
    this.pathSignal()
      ?.split('\0')
      .filter((x) => !x.startsWith('-') && !x.startsWith('+') && x !== '')
  );

  oldPath = signal<string | null>(null);
  editingPath = signal<string | null>(null);
  addingNewPath = signal(false);
  bulkPathEditMode = signal(false);
  bulkPaths = signal('');
  bulkFilterEditMode = signal(false);
  bulkFilters = signal('');

  openRemoteDestinationDialog() {
    const dialogRef = this.#dialog.open(TargetUrlDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        targetUrlModel: null,
        moduleType: 'SourceProvider',
      },
    });

    dialogRef.closed.subscribe((targetUrl) => {
      if (!targetUrl) return;

      const shortId = Math.random().toString(36).substring(2, 10);
      const protcolName = targetUrl.split('://')[0];
      const prefix = this.#sysInfo.systemInfo()?.PathSeparator === '\\' ? 'X:\\' : '/';

      const newRemotePath = `@${prefix}dupl-${protcolName}-${shortId}|${targetUrl}`;

      this.addPath(newRemotePath);
    });
  }

  togglePathBulkEdit() {
    if (this.bulkPathEditMode()) {
      this.bulkPathEditMode.set(false);
    } else {
      const paths = this.nonFilterPaths()?.join('\n') ?? '';
      this.bulkPaths.set(paths);
      this.bulkPathEditMode.set(true);
    }
  }

  savePathBulkEdit() {
    const newPaths =
      this.bulkPaths()
        .split('\n')
        .filter((p) => p.trim() !== '') ?? [];
    const filters = this.pathArray();
    const combined = [...newPaths, ...filters];
    const distinct = [...new Set(combined)].join('\0');
    this.sourceDataForm.controls.path.setValue(distinct);
  }

  toggleBulkFilterEdit() {
    if (this.bulkFilterEditMode()) {
      this.bulkFilterEditMode.set(false);
    } else {
      const filters = this.pathArray()
        .filter((x) => x !== '___none___' && (x.startsWith('-') || x.startsWith('+')))
        .join('\n');
      this.bulkFilters.set(filters);
      this.bulkFilterEditMode.set(true);
    }
  }

  saveBulkFilterEdit() {
    const newFilters =
      this.bulkFilters()
        .split('\n')
        .filter((p) => p.trim() !== '' && (p.startsWith('-') || p.startsWith('+'))) ?? [];
    const paths = this.nonFilterPaths() ?? [];
    const combined = [...paths, ...newFilters];
    const distinct = [...new Set(combined)].join('\0');
    this.sourceDataForm.controls.path.setValue(distinct);
  }

  editPath(oldPath: string) {
    if (oldPath && oldPath.startsWith('@')) {
      const dialogRef = this.#dialog.open(TargetUrlDialog, {
        maxWidth: '700px',
        maxHeight: '80vh',
        width: '100%',
        closeOnOutsideClick: false,
        data: {
          targetUrlModel: oldPath.split('|')[1] || null,
          moduleType: 'SourceProvider',
        },
      });

      dialogRef.closed.subscribe((targetUrl) => {
        if (!targetUrl) return;

        const prefix = oldPath.split('|')[0];
        const newPath = `${prefix}|${targetUrl}`;

        const currentPath = this.sourceDataForm.controls.path.value;
        this.sourceDataForm.controls.path.setValue(currentPath?.replace(oldPath, newPath) ?? '');
      });
      return;
    }
    this.oldPath.set(oldPath);
    this.editingPath.set(oldPath);
  }

  updateFilesLargerThan($event: any) {
    const { size, unit } = splitSize($event);
    this.sourceDataForm.controls.excludes.controls.filesLargerThan.setValue({
      size,
      unit,
    });
  }

  updatePath() {
    const oldPath = this.oldPath();
    const newPath = this.editingPath();

    if (!oldPath || !newPath || newPath === oldPath) {
      this.oldPath.set(null);
      this.editingPath.set(null);

      return;
    }

    const currentPath = this.sourceDataForm.controls.path.value;

    this.sourceDataForm.controls.path.setValue(currentPath?.replace(oldPath, newPath) ?? '');
    this.oldPath.set(null);
    this.editingPath.set(null);
  }

  cancelEditPath() {
    this.oldPath.set(null);
    this.editingPath.set(null);
  }

  removePath(path: string) {
    const currentPath = this.sourceDataForm.controls.path.value ?? '';
    const paths = currentPath.split('\0');
    const indexOfPath = paths.indexOf(path);

    if (indexOfPath === -1) return;

    paths.splice(indexOfPath, 1);
    const nonFilterPath = paths.filter((x) => x && x !== '').join('\0');

    this.sourceDataForm.controls.path.setValue(nonFilterPath);
  }

  addPath(path: string) {
    const currentPath = this.sourceDataForm.controls.path.value;
    const combined = [currentPath, path].filter((x) => x && x !== '').join('\0');

    this.sourceDataForm.controls.path.setValue(combined);
  }

  addFilter(newPath = '-*') {
    const currentPath = this.sourceDataForm.controls.path.value;
    const combined = [currentPath, newPath].filter((x) => x && x !== '').join('\0');

    this.sourceDataForm.controls.path.setValue(combined);
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

    const combined = [nonFilterPath, _newPath].filter((x) => x && x !== '').join('\0');
    this.sourceDataForm.controls.path.setValue(combined);
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

    const combined = [nonFilterPath, _newPath].filter((x) => x && x !== '').join('\0');
    this.sourceDataForm.controls.path.setValue(combined);
  }

  getPath() {
    return this.sourceDataForm.value.path ?? null;
  }

  getBackendIcon(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    const match = getConfigurationByUrl(url);
    return match.icon ?? 'database';
  }

  getRemotePathDisplayName(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    const match = getConfigurationByUrl(url);
    const name = match ? match.displayName : 'Unknown';
    return name;
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
    const existing = currentPath?.split('\0') || [];

    if (newPath && !existing.includes(newPath)) existing.push(newPath);

    const updatedPath = existing.filter((x) => x && x !== '').join('\0');
    this.sourceDataForm.controls.path.setValue(updatedPath);
    this.newPathCtrl.setValue('');
  }

  goBack() {
    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }

  next() {
    if (!this.#backupState.isNew()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }
}
