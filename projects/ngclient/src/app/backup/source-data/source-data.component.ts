import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  linkedSignal,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { form, FormField } from '@angular/forms/signals';
import { compatForm } from '@angular/forms/signals/compat';
import { ActivatedRoute, Router } from '@angular/router';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipMenu } from '@ship-ui/core/ship-menu';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import FileTreeComponent from '../../core/components/file-tree/file-tree.component';
import { applyIncludePick, findIncludePicks, remoteSourceFor } from '../../core/components/file-tree/include-pick';
import { TreeNodeBadge, treeNodeBadgeForKind } from '../../core/components/file-tree/tree-node-badges';
import { SizeComponent } from '../../core/components/size/size.component';
import { splitSize } from '../../core/functions/parse-size';
import ToggleCardComponent from '../../core/components/toggle-card/toggle-card.component';
import { defer } from 'rxjs';
import { DuplicatiServer } from '../../core/openapi';
import { WebModulesService } from '../../core/services/webmodules.service';
import { SysinfoState } from '../../core/states/sysinfo.state';
import { BackupState } from '../backup.state';
import { NullableTextControl } from '../general/nullable-text-control';
import { FiltersComponent } from '../components/filters/filters.component';
import { getBackendIcon, getRemotePathDisplayName, getSimplePath } from '../destination/destination.config-utilities';
import { AttributeExclusionsDialog } from './attribute-exclusions-dialog/attribute-exclusions-dialog';
import { IncludePickerDialog, IncludePickerResult } from './include-picker-dialog/include-picker-dialog';
import { TargetDiskDialog } from './target-disk-dialog/target-disk-dialog';
import { TargetUrlDialog } from './target-url-dialog/target-url-dialog';

const ATTRIBUTE_OPTION = 'exclude-files-attributes';
// Used when the server does not list the valid values for the option.
const DEFAULT_ATTRIBUTES = [
  'ReadOnly',
  'Hidden',
  'System',
  'Directory',
  'Archive',
  'Device',
  'Normal',
  'Temporary',
  'SparseFile',
  'ReparsePoint',
  'Compressed',
  'Offline',
  'NotContentIndexed',
  'Encrypted',
  'IntegrityStream',
  'NoScrubData',
];

// Shortcut tokens named the way the server names them in the folder tree (Duplicati SpecialFolders.cs)
const SHORTCUT_NAMES: Record<string, string> = {
  '%MY_DOCUMENTS%': 'Documents',
  '%MY_MUSIC%': 'Music',
  '%MY_PICTURES%': 'Pictures',
  '%MY_VIDEOS%': 'Videos',
  '%MY_MOVIES%': 'Movies',
  '%MY_DOWNLOADS%': 'Downloads',
  '%MY_PUBLIC%': 'Public',
  '%DESKTOP%': 'Desktop',
  '%APPDATA%': 'Application Data',
  '%HOME%': 'Home',
  '%HYPERV%': 'Hyper-V Machines',
  '%MSSQL%': 'Microsoft SQL Server',
};
const WINDOWS_SHORTCUT_NAMES: Record<string, string> = {
  '%MY_DOCUMENTS%': 'My Documents',
  '%MY_MUSIC%': 'My Music',
  '%MY_PICTURES%': 'My Pictures',
  '%MY_VIDEOS%': 'My Videos',
};
const QNAP_SHARE_PREFIX = '%QNAP_SHARE_';
const HYPERV_VM_PATH = /^%HYPERV%[\\/]+([^\\/]+)/i;

/** The tree node kind the server reports for a source path, so the list shows the same badge as the tree */
function sourcePathKind(path: string): string | null {
  if (/^[A-Za-z]:[\\/]?$/.test(path)) return 'drive';

  const token = /^%[^%]+%/.exec(path)?.[0];
  if (!token) return null;

  const segments = path.slice(token.length).split(/[\\/]/).filter(Boolean).length;
  const upper = token.toUpperCase();
  if (upper === '%HYPERV%') return segments === 0 ? 'hyperv' : segments === 1 ? 'hyperv:virtualmachine' : null;
  // Subfolders are plain folders in the tree; only the shortcut folder itself carries a badge
  if (segments > 0) return null;
  if (upper === '%MSSQL%') return 'mssql';
  if (token.startsWith(QNAP_SHARE_PREFIX)) return 'qnap:share';
  return 'special:' + token.slice(1, -1).toLowerCase();
}

@Component({
  selector: 'app-source-data',
  imports: [
    FormsModule,
    FormField,
    NullableTextControl,
    ShipFormField,
    ShipIcon,
    ShipButton,
    ShipToggle,
    ShipMenu,
    ShipTooltip,
    FiltersComponent,
    FileTreeComponent,
    ToggleCardComponent,
    SizeComponent,
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
  #webModules = inject(WebModulesService);
  #dupServer = inject(DuplicatiServer);

  // Hyper-V sources are stored by machine GUID; the server listing of %HYPERV% names them
  #hypervNames = signal<Record<string, string>>({});
  #hypervNamesRequested = false;
  #loadHypervNames = effect(() => {
    if (this.#hypervNamesRequested) return;
    if (!(this.nonFilterPaths() ?? []).some((path) => HYPERV_VM_PATH.test(path))) return;

    this.#hypervNamesRequested = true;
    defer(() =>
      this.#dupServer.postApiV1Filesystem({
        query: { showHidden: true, onlyFolders: true },
        body: { path: '%HYPERV%' },
      })
    ).subscribe({
      next: (nodes) => {
        const names: Record<string, string> = {};
        for (const node of nodes ?? []) {
          const id = node.id ? HYPERV_VM_PATH.exec(node.id)?.[1] : undefined;
          const name = (node as { Metadata?: Record<string, string | null> }).Metadata?.['hyperv:Name'] ?? node.text;
          if (id && name) names[id.toLowerCase()] = name;
        }
        this.#hypervNames.set(names);
      },
      // Without names the paths keep showing the machine GUID
      error: () => {},
    });
  });
  formRef = viewChild.required<ElementRef<HTMLFormElement>>('formRef');
  // Keep the shared controls as the single source of truth during the staged migration.
  sourceForm = compatForm(
    signal({
      path: this.#backupState.sourceDataForm.controls.path,
      filesLargerThan: this.#backupState.sourceDataForm.controls.excludes.controls.filesLargerThan,
    })
  );
  newPathForm = form(signal<string | null>(''));
  filesLargerThan = computed(() => {
    const { size, unit } = this.sourceForm.filesLargerThan().value();
    return size !== null && unit !== null ? `${size}${unit}` : null;
  });
  filesLargerThanField = form(linkedSignal(() => this.filesLargerThan()));
  osType = this.#backupState.osType;
  attributeExclusions = computed(() => {
    const setting =
      this.#backupState.settings().find((x) => x.Name?.replace(/^--/, '') === ATTRIBUTE_OPTION) ??
      this.#backupState.applicationOptions()?.find((x) => x.Name?.replace(/^--/, '') === ATTRIBUTE_OPTION);
    return (setting?.Value ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  });
  previewAttributes = computed(() =>
    this.attributeExclusions().filter((value) => ['hidden', 'system', 'temporary'].includes(value.toLowerCase()))
  );
  // Collapsed while nothing is configured; follows the configuration but can still be toggled by hand.
  editAttributeExclusions() {
    const dialogRef = this.#dialog.open(AttributeExclusionsDialog, {
      maxWidth: '500px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        selected: this.attributeExclusions(),
        options:
          this.#backupState.advancedOptions().find((x) => x.name === ATTRIBUTE_OPTION)?.options ?? DEFAULT_ATTRIBUTES,
      },
    });

    dialogRef.closed.subscribe((selected) => {
      if (!selected) return;

      const isAttributeOption = (x: { Name?: string | null }) => x.Name?.replace(/^--/, '') === ATTRIBUTE_OPTION;
      const inherited = this.#backupState.applicationOptions()?.find(isAttributeOption)?.Value;
      const Value = selected.join(',');

      this.#backupState.settings.update((settings) => {
        // An empty job value is only needed to override an inherited application-level value.
        if (!Value && !inherited) return settings.filter((x) => !isAttributeOption(x));
        if (!settings.some(isAttributeOption)) return [...settings, { Name: `--${ATTRIBUTE_OPTION}`, Value }];
        return settings.map((x) => (isAttributeOption(x) ? { ...x, Value } : x));
      });
    });
  }

  pathSignal = this.sourceForm.path().value;
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
  editingPathForm = form(this.editingPath);
  addingNewPath = signal(false);
  bulkPathEditMode = signal(false);
  bulkPaths = signal('');
  bulkPathsForm = form(this.bulkPaths);
  mobileMenuOpen = signal(false);
  backupId = this.#backupState.backupId();
  isLocalDiskSupported = computed(() =>
    this.#sysInfo.systemInfo()?.SourceProviderModules?.find((x) => x.Key == 'diskimage')
  );

  filters = signal<string[]>([]);

  // Source folders that only back up a chosen set of their contents
  pickedFolders = computed(() => {
    const paths = (this.pathSignal() ?? '').split('\0').filter((x) => x !== '');
    return new Set(findIncludePicks(paths).map((pick) => pick.folder));
  });

  #pathList() {
    return (this.sourceForm.path().value() ?? '').split('\0').filter((x) => x !== '');
  }

  isPickedFolder(path: string) {
    return this.pickedFolders().has(path);
  }

  // A readable form of a source path for the list, e.g. %MY_DOCUMENTS%/Screenshots/ -> Documents/Screenshots
  displayPath(path: string) {
    const parts = this.displayPathParts(path);
    return parts ? parts.name + parts.rest : path;
  }

  /** The shortcut name and the remainder of a source path such as %MY_DOCUMENTS%/Screenshots/, or null for a plain path */
  displayPathParts(path: string) {
    const token = /^%[^%]+%/.exec(path)?.[0];
    if (!token) return null;

    const isWindows = this.#sysInfo.systemInfo()?.OSType === 'Windows';
    const name = token.startsWith(QNAP_SHARE_PREFIX)
      ? token.slice(QNAP_SHARE_PREFIX.length, -1)
      : ((isWindows ? WINDOWS_SHORTCUT_NAMES[token] : undefined) ?? SHORTCUT_NAMES[token]);
    if (!name) return null;

    let rest = path.slice(token.length).replace(/[\\/]+$/, '');
    const vmId = HYPERV_VM_PATH.exec(path)?.[1];
    const vmName = vmId ? this.#hypervNames()[vmId.toLowerCase()] : undefined;
    if (vmId && vmName) rest = rest.replace(vmId, vmName);
    return { name, rest };
  }

  /** The icon and corner badge for a source row, matching how the folder tree draws the same entry */
  sourcePathIcon(path: string): { icon: string; badge: TreeNodeBadge | null } {
    const badge = treeNodeBadgeForKind(sourcePathKind(path));
    if (badge?.replacesIcon) return { icon: badge.icon, badge: null };
    return { icon: /[\\/%]$/.test(path) ? 'folder' : 'file', badge };
  }

  /** The folder a shortcut source such as %HOME% points to on the server, or null for a plain path */
  resolvedShortcutPath(path: string) {
    // Resolve a leading %TOKEN% so subfolders such as %DESKTOP%/notes/ also show their target
    const token = /^%[^%]+%/.exec(path)?.[0];
    if (!token) return null;

    const resolvedToken = this.#sysInfo.resolveShorthandPath(token);
    if (!resolvedToken || resolvedToken === token) return null;

    const rest = path.slice(token.length);
    const base = /^[\\/]/.test(rest) ? resolvedToken.replace(/[\\/]+$/, '') : resolvedToken;
    return base + rest;
  }

  openIncludePicker(folder: string) {
    const dialogRef = this.#dialog.open(IncludePickerDialog, {
      maxWidth: '700px',
      maxHeight: '80vh',
      width: '100%',
      closeOnOutsideClick: false,
      data: {
        folder,
        paths: this.#pathList(),
        backupId: this.backupId,
        separator: this.#sysInfo.systemInfo()?.DirectorySeparator ?? '/',
        // A folder on a remote source lists through its @mount|url entry
        remoteSource: remoteSourceFor(this.#pathList(), folder),
      },
    });

    dialogRef.closed.subscribe((result: IncludePickerResult | null) => {
      if (!result) return;

      const separator = this.#sysInfo.systemInfo()?.DirectorySeparator ?? '/';
      const next = applyIncludePick(this.#pathList(), folder, result.picks, result.excludes, separator);
      this.sourceForm.path().value.set(next.join('\0'));
    });
  }

  #syncFilters = effect(() => {
    const pathValue = this.pathSignal();
    const filterValues =
      pathValue?.split('\0').filter((x) => x !== '___none___' && (x.startsWith('-') || x.startsWith('+'))) ?? [];
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
    if (this.bulkPaths() === (this.nonFilterPaths()?.join('\n') ?? '')) return;

    const newPaths =
      this.bulkPaths()
        .split('\n')
        .filter((p) => p.trim() !== '') ?? [];
    const filters = this.pathArray();
    const combined = [...newPaths, ...filters];
    const distinct = [...new Set(combined)].join('\0');
    this.sourceForm.path().value.set(distinct);
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
      const currentPath = this.sourceForm.path().value();
      this.sourceForm.path().value.set(currentPath?.replace(oldPath, newRemotePath) ?? '');
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

      const currentPath = this.sourceForm.path().value();
      this.sourceForm.path().value.set(currentPath?.replace(oldPath, newPath) ?? '');
    });
  }

  updateFilesLargerThan(value: string) {
    const { size, unit } = splitSize(value);
    this.sourceForm.filesLargerThan().value.set({
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

    const currentPath = this.sourceForm.path().value();

    this.sourceForm.path().value.set(currentPath?.replace(oldPath, newPath) ?? '');
    this.oldPath.set(null);
    this.editingPath.set(null);
  }

  cancelEditPath() {
    this.oldPath.set(null);
    this.editingPath.set(null);
  }

  removePath(path: string) {
    const currentPath = this.sourceForm.path().value() ?? '';
    const paths = currentPath.split('\0');
    const indexOfPath = paths.indexOf(path);

    if (indexOfPath === -1) return;

    paths.splice(indexOfPath, 1);
    const nonFilterPath = paths.filter((x) => x && x !== '').join('\0');

    this.sourceForm.path().value.set(nonFilterPath);
  }

  addPath(path: string) {
    const currentPath = this.sourceForm.path().value();
    const combined = [currentPath, path].filter((x) => x && x !== '').join('\0');

    this.sourceForm.path().value.set(combined);
  }

  updateFilters(newFilters: string[]) {
    const nonFilterPaths = this.nonFilterPaths() ?? [];
    const combined = [...nonFilterPaths, ...newFilters].filter((x) => x && x !== '').join('\0');
    this.sourceForm.path().value.set(combined);
  }

  getPath() {
    return this.#backupState.sourceDataForm.value.path ?? null;
  }

  getBackendIcon(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    return getBackendIcon(url);
  }
  getRemotePathDisplayName(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    return getRemotePathDisplayName(url);
  }

  /** Where a remote source points, as host and path without the query string that may carry credentials */
  getRemotePathLocation(path: string | null | undefined) {
    if (!path) return '';
    const url = path.split('|')[1];
    if (!url) return '';
    // A local disk is named by its device, e.g. diskimage:///dev/sda -> /dev/sda
    if (url.startsWith('diskimage://')) return url.slice('diskimage://'.length);
    return getSimplePath(url);
  }

  toggleFilesLargerThan($event: boolean) {
    if ($event) {
      this.sourceForm.filesLargerThan().value.set({
        size: 50,
        unit: 'MB',
      });
    } else {
      this.sourceForm.filesLargerThan().value.set({
        size: null,
        unit: null,
      });
    }
  }

  addNewPath() {
    const currentPath = this.sourceForm.path().value();
    const newPath = this.newPathForm().value();

    // TODO - Add path validation
    const existing = currentPath?.split('\0') || [];

    if (newPath && !existing.includes(newPath)) existing.push(newPath);

    const updatedPath = existing.filter((x) => x && x !== '').join('\0');
    this.sourceForm.path().value.set(updatedPath);
    this.newPathForm().value.set('');
  }

  goBack() {
    this.#router.navigate(['general'], { relativeTo: this.#route.parent });
  }

  next() {
    if (this.#backupState.shouldAutoSave()) {
      this.#backupState.submit(true);
    }

    this.#router.navigate(['destination'], { relativeTo: this.#route.parent });
  }
}
