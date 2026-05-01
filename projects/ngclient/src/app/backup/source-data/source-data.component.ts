import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton, ShipChip, ShipDialogService, ShipFormField, ShipIcon, ShipMenu, ShipToggle } from '@ship-ui/core';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { SizeComponent, splitSize } from '../../core/components/size/size.component';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { getConfigurationByUrl } from '../destination/destination.config-utilities';
import { FiltersComponent } from '../components/filters/filters.component';
import { TargetDiskDialog } from './target-disk-dialog/target-disk-dialog';
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
    FiltersComponent,
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
  mobileMenuOpen = signal(false);
  isLocalDiskSupported = computed(() =>
    this.#sysInfo.systemInfo()?.SourceProviderModules?.find((x) => x.Key == 'diskimage')
  );

  filters = signal<string[]>([]);

  #syncFilters = effect(() => {
    const pathValue = this.pathSignal();
    const filterValues =
      pathValue
        ?.split('\0')
        .filter((x) => x !== '___none___' && (x.startsWith('-') || x.startsWith('+'))) ?? [];
    this.filters.set(filterValues);
  });

  openRemoteDestinationDialog() {
    const dialogRef = this.#dialog.open(TargetUrlDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        targetUrlModel: null,
        moduleType: 'SourceProvider',
        askToCreate: false,
        expectedResult: 'destinationNotEmpty',
        suppressErrorDialogs: true,
        backupId: null,
        sourcePrefix: null,
      },
    });

    dialogRef.component.closed.subscribe((targetUrl) => {
      if (!targetUrl) return;

      const shortId = Math.random().toString(36).substring(2, 10);
      const protocolName = targetUrl.split('://')[0];
      const prefix = this.#sysInfo.systemInfo()?.DirectorySeparator === '\\' ? 'X:\\' : '/';

      const newRemotePath = `@${prefix}dupl-${protocolName}-${shortId}|${targetUrl}`;

      this.addPath(newRemotePath);
    });
  }

  openLocalDiskDialog() {
    const dialogRef = this.#dialog.open(TargetDiskDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        initialPath: null,
      },
    });

    dialogRef.closed.subscribe((destination) => {
      if (!destination) return;

      const shortId = Math.random().toString(36).substring(2, 10);
      const prefix = this.#sysInfo.systemInfo()?.DirectorySeparator === '\\' ? 'X:\\' : '/';

      const newRemotePath = `@${prefix}dupl-disk-${shortId}|diskimage://${destination}`;

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

  editPath(oldPath: string) {
    if (oldPath && oldPath.startsWith('@')) {
      const parts = oldPath.split('|');
      if (parts.length !== 2) return;

      if (parts[1].startsWith('diskimage://')) {
        this.editLocalDiskSource(oldPath, parts[0], parts[1].substring('diskimage://'.length));
      } else {
        this.editTargetUrlPath(oldPath, parts[0], parts[1]);
      }
      return;
    }
    this.oldPath.set(oldPath);
    this.editingPath.set(oldPath);
  }

  editLocalDiskSource(oldPath: string, prefix: string, path: string) {
    const dialogRef = this.#dialog.open(TargetDiskDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        initialPath: path,
      },
    });

    dialogRef.closed.subscribe((newPath) => {
      if (!newPath) return;

      const newRemotePath = `${prefix}|diskimage://${newPath}`;
      const currentPath = this.sourceDataForm.controls.path.value;
      this.sourceDataForm.controls.path.setValue(currentPath?.replace(oldPath, newRemotePath) ?? '');
    });
  }

  editTargetUrlPath(oldPath: string, prefix: string, url: string) {
    const dialogRef = this.#dialog.open(TargetUrlDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        targetUrlModel: url,
        moduleType: 'SourceProvider',
        askToCreate: false,
        expectedResult: 'destinationNotEmpty',
        suppressErrorDialogs: true,
        backupId: this.#backupState.backupId(),
        sourcePrefix: prefix,
      },
    });

    dialogRef.closed.subscribe((targetUrl) => {
      if (!targetUrl) return;

      const newPath = `${prefix}|${targetUrl}`;

      const currentPath = this.sourceDataForm.controls.path.value;
      this.sourceDataForm.controls.path.setValue(currentPath?.replace(oldPath, newPath) ?? '');
    });
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

  updateFilters(newFilters: string[]) {
    const nonFilterPaths = this.nonFilterPaths() ?? [];
    const combined = [...nonFilterPaths, ...newFilters].filter((x) => x && x !== '').join('\0');
    this.sourceDataForm.controls.path.setValue(combined);
  }

  getPath() {
    return this.sourceDataForm.value.path ?? null;
  }

  getBackendIcon(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    if (url.startsWith('diskimage:')) return 'assets/dest-icons/external-harddrive.png';
    const match = getConfigurationByUrl(url);
    return match.icon ?? 'database';
  }

  getRemotePathDisplayName(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    if (url.startsWith('diskimage:')) return $localize`Local disk`;

    const match = getConfigurationByUrl(url);
    const name = match ? match.displayName : 'Unknown';
    return name;
  }

  toggleFilesLargerThan($event: boolean) {
    if ($event) {
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
    if (this.#backupState.shouldAutoSave()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['schedule'], { relativeTo: this.#route.parent });
  }
}
