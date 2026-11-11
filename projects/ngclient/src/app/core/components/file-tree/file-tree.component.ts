import { DatePipe, NgTemplateOutlet } from '@angular/common';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ShipAlert } from '@ship-ui/core/ship-alert';
import { ShipTooltip } from '@ship-ui/core/ship-tooltip';
import { ShipButton } from '@ship-ui/core/ship-button';
import { ShipButtonGroup } from '@ship-ui/core/ship-button-group';
import { ShipDialog, ShipDialogService } from '@ship-ui/core/ship-dialog';
import { ShipFormField } from '@ship-ui/core/ship-form-field';
import { ShipIcon } from '@ship-ui/core/ship-icon';
import { ShipList } from '@ship-ui/core/ship-list';
import { ShipProgressBar } from '@ship-ui/core/ship-progress-bar';
import { ShipToggle } from '@ship-ui/core/ship-toggle';
import { catchError, defer, finalize, forkJoin, map, Observable, of, switchMap, timer } from 'rxjs';
import { getBackendIcon, getRemotePathDisplayName } from '../../../backup/destination/destination.config-utilities';
import {
  DuplicatiServer,
  GetApiV1BackupByIdFilesResponse,
  PostApiV1FilesystemResponse,
  RemoteDestinationType,
  SearchEntriesItemDto,
  TreeNodeDto,
} from '../../openapi';
import { randomUUID } from '../../functions/crypto';
import { BytesPipe } from '../../pipes/byte.pipe';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';
import { evaluateFileTreeFilters } from './file-tree-filter-matcher';
import { isFolderPath } from './file-tree-path-utils';
import { findIncludePickContaining, findIncludePicks, toggleInIncludePick } from './include-pick';
import { BackupSettings, PagedListResult, FileTreeListingService } from './file-tree-listing.service';
export type { BackupSettings } from './file-tree-listing.service';

import { buildSearchResultTree, sortFileTreeNodes } from './file-tree.presentation';
import {
  FileTreeNode,
  getInheritedExclusionState,
  RemoteSource,
  ROOTPATH,
  TreeEvalEnum,
  TreeNode,
} from './file-tree.models';

// Keep existing consumers compatible while the shared model lives outside the component.
export { getInheritedExclusionState, TreeEvalEnum } from './file-tree.models';

export { isFolderPath };

// Filters only ever apply to paths that the backup enumerates, i.e. the selected
// sources and everything below a selected source folder. A node outside every
// source is never backed up, no matter what the filters say.
export const isPathWithinSources = (
  nodeId: string,
  resolvedNodeId: string | null | undefined,
  sources: string[]
): boolean =>
  sources.some(
    (source) =>
      nodeId === source ||
      resolvedNodeId === source ||
      (isFolderPath(source) && (nodeId.startsWith(source) || (resolvedNodeId?.startsWith(source) ?? false)))
  );

type TreeNodeBadge = {
  icon: string;
  label: string;
  announce?: boolean;
  /** Show the icon in place of the folder/file icon instead of as a corner badge. */
  replacesIcon?: boolean;
};

/**
 * Icon names chosen in code are invisible to the ship-fg font subsetter, which only scans
 * templates and string literals carrying the shicon prefix; the prefix makes it include the glyph.
 */
const shIcon = (marked: `shicon:${string}`) => marked.slice('shicon:'.length);

type InputValueChangedEvent = CustomEvent<{ value: string }>;

type UnrootedSource = {
  id: string;
  path: string;
  displayName: string;
  icon: string;
};

interface CustomEventMap {
  inputValueChanged: InputValueChangedEvent;
}

declare global {
  interface HTMLInputElement {
    addEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: HTMLElement, ev: CustomEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ): void;
  }
}

// Suffix used to build the id of the synthetic "load more" pagination node.
// The \0 character cannot appear in real filesystem paths, so it never collides with a real node.
const LOAD_MORE_ID_SUFFIX = '\0load-more';

@Component({
  selector: 'app-file-tree',
  imports: [
    ShipButton,
    ShipButtonGroup,
    ShipToggle,
    ShipIcon,
    ShipFormField,
    ShipList,
    ShipProgressBar,
    ShipDialog,
    NgTemplateOutlet,
    FormsModule,
    BytesPipe,
    DatePipe,
    ShipAlert,
    ShipTooltip,
  ],
  providers: [DatePipe],
  templateUrl: './file-tree.component.html',
  styleUrl: './file-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.disabled]': 'disabled()',
    '[class.maximized]': 'maximized()',
    '(document:keydown.escape)': 'onDocumentEscape($event)',
  },
})
export default class FileTreeComponent {
  #dupServer = inject(DuplicatiServer);
  #listing = inject(FileTreeListingService);
  #sysInfo = inject(SysinfoState);
  #datePipe = inject(DatePipe);
  #dialog = inject(ShipDialogService);
  #fileTreeState = inject(FileTreeState);
  #injector = inject(Injector);

  multiSelect = input(false);
  disabled = input(false);
  showFiles = input(false);
  selectFiles = input(false);
  onlySelectFolder = input(false);
  accepts = input<string | null | undefined>(null);
  startingPath = input<string | null>(null);
  rootPaths = input<string[]>([]);
  initialNodes = input<TreeNodeDto[]>([]);
  // Metadata for the root paths, keyed by path, used to resolve display names
  rootMetadata = input<{ [path: string]: { [key: string]: string | null } | null | undefined }>({});
  backupSettings = input<BackupSettings | null>(null);
  pathRefreshTrigger = input(false);
  showHiddenNodes = input(false);
  enableCreateFolder = input(false);
  hideShortcuts = input(false);
  resolvePaths = input(false);
  customRemoteMode = input<'gsuite' | 'o365' | 'diskimage' | 'backend' | null>(null);
  showUnrootedSources = input(false);
  // Offers "choose what to include" on folder rows, and toggles entries inside a picked folder as picks
  enableIncludePicker = input(false);
  includePick = output<string>();
  // A remote source as @mount|url whose mount is the first root path, so the root lists through it
  rootRemoteSource = input<string | null>(null);
  #rootRemoteSource = computed(() => this.#parseRemotePath(this.rootRemoteSource()));
  backupId = input<string | null | undefined>('');
  connectionStringId = input<number | null | undefined>(null);
  sourcePrefix = input<string | null | undefined>('');
  destinationUrl = input<string | null | undefined>('');
  // Which kind of remote the destinationUrl refers to when browsing in 'backend' mode
  destinationType = input<RemoteDestinationType>('Backend');
  loadExtendedData = input(true);
  hasExtendedData = output<string>();
  searchMode = input(false);
  searchResults = input<SearchEntriesItemDto[]>([]);
  // Metadata for the folders above the search results, keyed by path, used to resolve display names
  searchParentMetadata = input<{ [path: string]: { [key: string]: string | null } | null | undefined }>({});

  _showHiddenNodes = signal(false);
  maximized = signal(false);
  maximizeLabels = {
    maximize: $localize`Maximize file tree`,
    restore: $localize`Restore file tree size`,
  };
  /**
   * Corner badges layered over the folder/file icon, keyed by the node `kind` sent by the
   * server (exact match first, then the part before the colon). `announce` adds the label
   * to the row's accessible name, for states the visible name does not already convey.
   */
  readonly #treeNodeBadges: Record<string, TreeNodeBadge> = {
    symlink: { icon: shIcon('shicon:arrow-bend-up-right'), label: $localize`Symbolic link`, announce: true },
    locked: { icon: shIcon('shicon:lock'), label: $localize`Access denied`, announce: true },
    drive: { icon: shIcon('shicon:hard-drive'), label: $localize`Drive` },
    'drive:network': { icon: shIcon('shicon:globe-simple'), label: $localize`Network drive` },
    'drive:removable': { icon: shIcon('shicon:usb'), label: $localize`Removable drive` },
    special: { icon: shIcon('shicon:star'), label: $localize`Special folder` },
    'special:home': { icon: shIcon('shicon:user'), label: $localize`Home folder` },
    'special:my_documents': { icon: shIcon('shicon:file-text'), label: $localize`Documents folder` },
    'special:my_music': { icon: shIcon('shicon:music-note'), label: $localize`Music folder` },
    'special:my_pictures': { icon: shIcon('shicon:image'), label: $localize`Pictures folder` },
    'special:my_videos': { icon: shIcon('shicon:film-strip'), label: $localize`Videos folder` },
    'special:my_movies': { icon: shIcon('shicon:film-strip'), label: $localize`Movies folder` },
    'special:desktop': { icon: shIcon('shicon:desktop'), label: $localize`Desktop folder` },
    'special:appdata': { icon: shIcon('shicon:gear'), label: $localize`Application data folder` },
    'special:my_downloads': { icon: shIcon('shicon:download-simple'), label: $localize`Downloads folder` },
    'special:my_public': { icon: shIcon('shicon:users-three'), label: $localize`Public folder` },
    'qnap:share': { icon: shIcon('shicon:share-network'), label: $localize`QNAP shared folder` },
    hyperv: { icon: shIcon('shicon:cube'), label: $localize`Hyper-V` },
    'hyperv:virtualmachine': {
      icon: shIcon('shicon:monitor'),
      label: $localize`Hyper-V virtual machine`,
      replacesIcon: true,
    },
    mssql: { icon: shIcon('shicon:database'), label: $localize`Microsoft SQL Server` },
    'mssql:server': { icon: shIcon('shicon:hard-drives'), label: $localize`SQL Server host` },
    'mssql:instance': { icon: shIcon('shicon:stack'), label: $localize`SQL Server instance` },
    'mssql:database': { icon: shIcon('shicon:database'), label: $localize`SQL Server database`, replacesIcon: true },
  };
  createFolderDialogOpen = signal(false);
  createFolderPath = signal<string | null>(null);
  errorMessage = signal<string | null>(null);
  anyRemoteSourcesLoaded = signal(false);

  treeContainerRef = viewChild<ElementRef<HTMLDivElement>>('treeContainer');
  formRef = viewChild<ElementRef<HTMLFormElement>>('formRef');
  pathDiscoveryMethod = signal<'browse' | 'path'>('browse');
  isLoading = signal<string | null>(null);
  currentPath = signal<string>('');
  #inputRef = signal<HTMLInputElement | null>(null);
  treeSearchQuery = signal<string>('');
  treeNodes = signal<TreeNode[]>([]);
  pathDelimiter = computed(() => this.#sysInfo.systemInfo()?.DirectorySeparator ?? '');

  // Boolean guard to prevent remote eval from being called when not needed
  #performRemoteEval = computed(() => {
    const anyFilters = this.currentPathArray()
      .filter((x) => this.#isFilter(x))
      .find((x) => x.includes('*') || x.includes('[') || x.includes('{') || x.includes('?'));
    return anyFilters && this.#sysInfo.hasV2FilterOperations();
  });

  filterGroups = this.#sysInfo.filterGroups();

  // Source folders that only back up a chosen set of their contents
  pickedFolders = computed(() => new Set(findIncludePicks(this.currentPathArray()).map((pick) => pick.folder)));
  includePickLabels = {
    choose: $localize`Choose what to include`,
    edit: $localize`Edit what is included`,
  };

  isPickedFolder(node: FileTreeNode) {
    const folder = this.includePickFolder(node);
    return folder !== null && this.pickedFolders().has(folder);
  }

  offersIncludePicker(node: FileTreeNode) {
    return this.enableIncludePicker() && node.cls === 'folder' && node.id !== ROOTPATH && !node.isLoadMore;
  }

  // The folder a pick is stored under is the node id as-is: a shortcut such as %MY_DOCUMENTS% stays
  // a token, since its entries are listed as %MY_DOCUMENTS%/name and filters accept that form.
  // The root of a remote source is its mount, whose entries are listed below it with a separator.
  includePickFolder(node: FileTreeNode): string | null {
    if (!node.id) return null;
    if (node.remoteSource && !node.remoteSource.path) return this.#appendDirSep(node.id);
    return node.id;
  }

  requestIncludePick(event: Event, node: FileTreeNode) {
    event.stopPropagation();
    event.preventDefault();
    const folder = this.includePickFolder(node);
    if (this.disabled() || !folder) return;
    this.includePick.emit(folder);
  }

  isByBackupSettings = computed(() => {
    const backupSettings = this.backupSettings();

    if (backupSettings === undefined || backupSettings?.id === undefined || backupSettings?.time === undefined) {
      return false;
    }

    return true;
  });
  searchableTreeNodes = computed<TreeNode[]>(() => {
    const query = this.treeSearchQuery();
    return query
      ? this.treeNodes().filter((x) => x.text?.toLowerCase().includes(query.toLowerCase()))
      : this.treeNodes();
  });

  // The currentPath signal split into an array of paths and filters
  currentPathArray = computed(() => {
    return this.currentPath()
      .split('\0')
      .filter((x) => x !== '' && x !== ROOTPATH);
  });

  // The paths signal where shortcut paths are resolved to their full path
  currentPathResolved = computed(() => {
    const currentPaths = this.currentPathArray();

    return currentPaths
      .map((x) => {
        const path = this.treeNodes().find((n) => n.id === x)?.resolvedpath ?? x;
        return this.#sysInfo.resolveShorthandPath(path);
      })
      .join('\0');
  });

  /** Whether the path is the mount folder of the remote source rather than a folder inside it. */
  #isRemoteMount(path: string, remote: RemoteSource) {
    return path.replace(/[\\/]$/, '') === remote.mount.replace(/[\\/]$/, '');
  }

  #parseRemotePath(path: string | null | undefined): RemoteSource | null {
    if (!path) return null;

    if (path.startsWith('@') && path.includes('|')) {
      const parts = path.split('|');
      const prefix = parts[0];
      const url = parts[1];
      const type = url.split('://')[0];
      let subpath = parts[2] ?? '';

      // Disk images have the initial path in the url
      if (type === 'diskimage' && !subpath) {
        subpath = this.#appendDirSep(parts[1].split('://')[1]);
      }

      return { mount: prefix.substring(1), prefix: prefix, url, type, path: subpath };
    }

    return null;
  }

  #unrootedSources = computed(() => {
    if (!this.showUnrootedSources()) return [];
    let rootPaths = this.rootPaths();
    if (rootPaths === undefined || rootPaths.length === 0) {
      rootPaths = [ROOTPATH];
    }

    const currentPaths = this.currentPathArray()
      .filter((x) => !this.#isFilter(x))
      .filter((x) => !x.startsWith('%'))
      .filter((x) => !rootPaths.find((y) => x.startsWith(y)));

    return currentPaths.map((x) => {
      const remoteSource = this.#parseRemotePath(x);
      if (remoteSource) {
        const res: UnrootedSource = {
          id: x,
          path: remoteSource.mount,
          displayName: getRemotePathDisplayName(remoteSource.url),
          icon: getBackendIcon(remoteSource.url),
        };
        return res;
      }

      return {
        id: x,
        path: x,
        displayName: x,
        icon: null,
      };
    });
  });

  #resolveWithRemoteSource(currentPaths: string[]): string[] {
    return currentPaths.map((x) => {
      if (this.#isFilter(x)) return x;
      const remote = this.#parseRemotePath(x);
      if (remote) return this.#appendDirSep(remote.mount);
      return x;
    });
  }

  TreeEvalEnum = TreeEvalEnum;

  // Data sent to the server to evaluate the filters
  #remoteEvalInput = computed(() => {
    if (!this.#performRemoteEval()) return null;

    const currentPaths = this.#resolveWithRemoteSource(this.currentPathArray());

    const sources = currentPaths.filter((x) => !this.#isFilter(x));
    const filters = currentPaths.filter((x) => this.#isFilter(x));

    const pathsToTest = this.searchableTreeNodes()
      .filter((x) => !x.isLoadMore)
      .map((x) => x.id!)
      .filter(Boolean);

    return {
      paths: pathsToTest,
      sources: sources,
      filters: filters,
    };
  });

  // Resource that performs the remote evaluation of the filters
  #remoteFilterResource = rxResource({
    params: () => ({ data: this.#remoteEvalInput() }),
    stream: ({ params }) => {
      if (!this.#performRemoteEval() || !params.data || params.data.sources.length === 0) return of(null);

      return timer(300).pipe(
        switchMap(() =>
          defer(() =>
            this.#dupServer.postApiV2FilesystemTestFilter({
              body: {
                Paths: params.data?.paths,
                Sources: params.data?.sources,
                Filters: params.data?.filters,
              },
            })
          ).pipe(
            map((res) => {
              if (!res.Success || !res.Data) {
                console.log('Error evaluating filters', res);
                return null;
              }

              const map = new Map<string, TreeEvalEnum>();
              for (const r of res.Data) {
                if (r.Path) {
                  let state = TreeEvalEnum.None;
                  if (r.Included) {
                    state = TreeEvalEnum.Included;
                  } else if (r.MatchedFilter) {
                    state = TreeEvalEnum.Excluded;
                  }
                  map.set(r.Path, state);
                }
              }
              return map;
            }),
            catchError(() => of(null))
          )
        )
      );
    },
  });

  // Build tree structure from search results
  searchResultTreeStructure = computed<FileTreeNode[]>(() => {
    const searchResults = this.searchResults();
    if (searchResults.length === 0) {
      return [];
    }

    const currentPaths = this.currentPathArray();
    const showHiddenNodes = this.showHiddenNodes();

    // Display names already known from the browsed tree, used for folders that
    // are only present in the results as the parent of a match
    const rootMetadata = this.rootMetadata();
    const knownNames = new Map<string, string>();
    for (const rootPath of this.rootPaths()) {
      const name = this.#getDisplayName(null, rootMetadata[rootPath]);
      if (name) knownNames.set(rootPath, name);
    }
    for (const node of this.treeNodes()) {
      if (node.id && node.text && !node.isLoadMore) knownNames.set(node.id, node.text);
    }
    for (const [path, metadata] of Object.entries(this.searchParentMetadata())) {
      const name = this.#getDisplayName(null, metadata);
      if (name) knownNames.set(path, name);
    }

    return buildSearchResultTree({
      searchResults,
      knownNames,
      showHiddenNodes,
      getPathDelimiter: (path) => this.#getPathDelimiter(path),
      isFolder: (path) => this.#isFolder(path),
      getDisplayName: (text, metadata) => this.#getDisplayName(text, metadata),
      evaluate: (path, kind) =>
        this.#performRemoteEval()
          ? this.#evalRemote(path, null, currentPaths, kind)
          : this.#eval(currentPaths, path, kind, null),
      isIndeterminate: (path) => this.isIndeterminate(currentPaths, path),
      sort: {
        foldersFirst: this.#fileTreeState.foldersFirst(),
        caseSensitive: this.#fileTreeState.caseSensitiveSort(),
      },
    });
  });

  #sortNodes(nodes: FileTreeNode[]) {
    sortFileTreeNodes(nodes, {
      foldersFirst: this.#fileTreeState.foldersFirst(),
      caseSensitive: this.#fileTreeState.caseSensitiveSort(),
    });
  }

  treeStructure = computed<FileTreeNode[]>(() => {
    if (this.searchMode()) {
      return this.searchResultTreeStructure();
    }

    const remoteEvals = this.#remoteFilterResource.value(); // read dependency

    const showHiddenNodes = this._showHiddenNodes();
    const currentPaths = this.#resolveFilterGroups(this.currentPathArray());

    const nodes = this.searchableTreeNodes();
    const rootPaths = this.rootPaths();
    const rootMetadata = this.rootMetadata();
    const accepts = this.accepts();

    let roots: FileTreeNode[] = [];

    if (rootPaths.length > 0) {
      const rootRemote = this.#rootRemoteSource();
      roots = rootPaths.map((rootPath, index) => {
        const evalState = this.#performRemoteEval()
          ? this.#evalRemote(rootPath, null, currentPaths, 'folder')
          : this.#eval(currentPaths, rootPath, 'folder', null);
        const remoteSource = index === 0 && rootRemote ? rootRemote : undefined;

        return {
          id: rootPath,
          resolvedpath: rootPath,
          text:
            remoteSource && this.#isRemoteMount(rootPath, remoteSource)
              ? getRemotePathDisplayName(remoteSource.url)
              : this.#getDisplayName(rootPath, rootMetadata[rootPath]),
          parentPath: '',
          children: [],
          evalState: evalState,
          isIndeterminate: false,
          cls: this.#isFolder(rootPath) ? 'folder' : 'file',
          remoteSource,
          customIcon: remoteSource ? getBackendIcon(remoteSource.url) : undefined,
        } as any as FileTreeNode;
      });
    } else {
      roots = [
        {
          id: ROOTPATH,
          resolvedpath: ROOTPATH,
          text: $localize`Computer`,
          parentPath: '',
          children: [],
          evalState: TreeEvalEnum.None,
          isIndeterminate: false,
          cls: 'folder',
        } as any as FileTreeNode,
      ];
    }

    const additionalRoots = this.#unrootedSources().map(
      (x) =>
        ({
          id: x.path,
          resolvedpath: x.path,
          remoteSource: this.#parseRemotePath(x.id),
          text: x.displayName,
          parentPath: '',
          children: [],
          evalState: TreeEvalEnum.Included,
          isIndeterminate: false,
          cls: 'folder',
          customIcon: x.icon,
        }) as any as FileTreeNode
    );

    roots = [...roots, ...additionalRoots];

    roots.map((root) => {
      const nodeMap = new Map<string, FileTreeNode>();

      if (!root.id) {
        return;
      }
      const rootPath = root.id;

      if (accepts) {
        root.accepted = true;
      }

      nodeMap.set(rootPath, root);

      const filteredNodes = rootPaths.length > 0 ? nodes.filter((x) => x.parentPath.startsWith(rootPath)) : nodes;

      for (const node of filteredNodes) {
        if (!node.id) {
          continue;
        }
        const nodePath = node.id;

        if (!node.cls) {
          continue;
        }

        if (nodeMap.has(nodePath)) {
          continue;
        }

        const parentNode = nodeMap.get(node.parentPath);
        const isLoadMore = node.isLoadMore === true;
        const evalState =
          isLoadMore || (node.hidden === true && !showHiddenNodes)
            ? TreeEvalEnum.None
            : this.#performRemoteEval()
              ? this.#evalRemote(nodePath, parentNode, currentPaths, node.cls)
              : this.#eval(currentPaths, nodePath, node.cls, parentNode);

        const newNode: FileTreeNode = {
          ...node,
          isIndeterminate: isLoadMore ? false : this.isIndeterminate(currentPaths, nodePath),
          evalState: evalState,
          children: [],
        };

        if (isLoadMore) {
          newNode.accepted = true;
        } else if (accepts) {
          newNode.accepted = this.matchAccepts(accepts, newNode);
        }

        nodeMap.set(nodePath, newNode);
        if (newNode.id?.startsWith('%') && newNode.id?.endsWith('%'))
          nodeMap.set(this.#appendDirSep(nodePath), newNode);
        if (parentNode) {
          parentNode.children.push(newNode);
        }
      }

      this.#sortNodes(root.children);

      return root;
    });
    return roots;
  });

  #resolveFilterGroups(currentPaths: string[]): string[] {
    const paths = structuredClone(currentPaths);
    for (let index = 0; index < paths.length; index++) {
      const path = paths[index];
      const x = path.slice(1);

      if (x.startsWith('{') && x.endsWith('}')) {
        const groupName = x.slice(1, -1);
        const filterGroup = this.filterGroups?.['FilterGroups']?.[groupName];

        if (filterGroup && filterGroup.length) {
          const _filterGroup = filterGroup.map((x) => `-${x}`);
          paths.splice(index, 1, ..._filterGroup);
        }
      }
    }
    return paths;
  }

  #appendDirSep(path?: string | null) {
    if (!path) return ROOTPATH;
    const pathDelimiter = this.#getPathDelimiter(path);
    if (path.endsWith('/') || path.endsWith('\\') || path === ROOTPATH) return path;
    return path + pathDelimiter;
  }

  #resolveNodeId(node: TreeNodeDto | null | undefined) {
    if (!node?.id) return null;
    if (!this.resolvePaths()) return node.id;
    if (!node.resolvedpath) return node.id;

    if (node.id.startsWith('%') && node.id.endsWith('%')) return this.#appendDirSep(node.resolvedpath);
    return node.resolvedpath;
  }

  #evalRemote(
    nodeId: string,
    parentNode: FileTreeNode | null | undefined,
    currentPaths: string[],
    nodeType: string
  ): TreeEvalEnum {
    const inheritedExclusion = getInheritedExclusionState(parentNode?.evalState);
    if (inheritedExclusion !== null) return inheritedExclusion;

    // Nodes outside every source are never backed up, so filters cannot apply to them
    if (!this.#isNodeWithinSources(currentPaths, nodeId)) return TreeEvalEnum.None;

    const evalMap = this.#remoteFilterResource.value();
    if (evalMap && evalMap.has(nodeId)) {
      return evalMap.get(nodeId)!;
    }

    // If the remote does not have the node, fall back to local evaluation
    return this.#eval(currentPaths, nodeId, nodeType, parentNode);
  }

  #isNodeWithinSources(currentPaths: string[], nodeId: string): boolean {
    const sources = this.#resolveWithRemoteSource(currentPaths.filter((x) => !this.#isFilter(x)));
    const resolvedNodeId = this.#resolveNodeId(this.treeNodes().find((x) => x.id === nodeId)) ?? nodeId;
    return isPathWithinSources(nodeId, resolvedNodeId, sources);
  }

  #eval(
    currentPaths: string[],
    nodeId: string,
    nodeType: string,
    parentNode: FileTreeNode | null | undefined
  ): TreeEvalEnum {
    const inheritedExclusion = getInheritedExclusionState(parentNode?.evalState);
    if (inheritedExclusion !== null) return inheritedExclusion;

    let result = TreeEvalEnum.None;

    const sources = this.#resolveWithRemoteSource(currentPaths.filter((x) => !this.#isFilter(x)));
    const filters = currentPaths.filter((x) => this.#isFilter(x));
    const isMultiSelect = this.multiSelect();
    // If we are resolving paths, also match against the resolved path
    const resolvedNodeId = this.#resolveNodeId(this.treeNodes().find((x) => x.id === nodeId)) ?? nodeId;

    if (sources.length === 0) return result;

    for (let index = 0; index < sources.length; index++) {
      const x = sources[index];
      // A source itself is always backed up; the backend never runs its root entries through the filters
      if (nodeId === x || resolvedNodeId == x) return TreeEvalEnum.Included;

      if (!isMultiSelect || !this.#isFolder(x)) continue;

      const res = nodeId?.startsWith(x) || resolvedNodeId?.startsWith(x);

      if (res) {
        result = TreeEvalEnum.Included;
        break;
      }
    }

    if (filters.length === 0) return result;

    // Keep the upstream source-scope guard before evaluating local filters (#580).
    if (!isPathWithinSources(nodeId, resolvedNodeId, sources)) return result;
    const included = evaluateFileTreeFilters(filters, { path: nodeId, resolvedPath: resolvedNodeId, kind: nodeType });
    return included === undefined ? result : included ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
  }

  // A folder is partially selected when any selected path (folder or file) lies inside it.
  // A file only counts as partially selected through a selected folder path (legacy behavior).
  isIndeterminate(currentPaths: string[], nodeId: string) {
    const isFolder = this.#isFolder(nodeId);
    return this.#resolveWithRemoteSource(currentPaths)
      .filter((x) => !x.startsWith('-'))
      .some((x) => x.startsWith(nodeId) && (isFolder || this.#isFolder(x)));
  }

  isCurrentPathFolder() {
    const currentPath = this.currentPath();
    if (!currentPath) return false;
    return (
      currentPath.endsWith('/') ||
      currentPath.endsWith('\\') ||
      (currentPath.startsWith('%') &&
        currentPath.endsWith('%') &&
        !currentPath.includes('/') &&
        !currentPath.includes('\\'))
    );
  }

  #getPathDelimiter(path?: string | null): string {
    if (!path) return this.pathDelimiter();
    if (path.includes('/')) return '/';
    if (path.includes('\\')) return '\\';
    return this.pathDelimiter();
  }

  showHiddenNodesEffect = effect(() => this._showHiddenNodes.set(this.showHiddenNodes()));

  pathDiscoveryMethodEffect = effect(() => {
    const discoveryMethod = this.pathDiscoveryMethod();
    const input = this.#inputRef();

    if (discoveryMethod === 'browse' && input) {
      const value = input.value;
      // Avoid firing the event when the input is empty on startup
      if (value === null || value === undefined || value === '') return;
      this.currentPath.set(value);
    }
  });

  matchAccepts(accepts: string, node: FileTreeNode) {
    if (!accepts) return true;
    if (node.cls === 'folder' || node.id === ROOTPATH) return true;

    const extensions = accepts.split(',');

    if (extensions.length === 0) return true;

    const fileExt = '.' + node.id!.slice(node.id!.indexOf('.'));

    if (!fileExt) return false;

    return extensions.some((x) => fileExt.endsWith(x));
  }

  currentPathEffect = effect(() => {
    const input = this.#inputRef();

    if (input) {
      input.value = this.currentPath();
      input.dispatchEvent(new Event('input'));
    }
  });

  inputValueChangeAbortController: AbortController | null = null;
  inputRefEffect = effect(() => {
    const input = this.formRef()?.nativeElement?.querySelector('input');

    if (!input) return;

    this.#createCustomInputEventListener(input);

    if (this.inputValueChangeAbortController) {
      this.inputValueChangeAbortController.abort();
    }

    this.inputValueChangeAbortController = new AbortController();

    input.addEventListener(
      'inputValueChanged',
      (event: InputValueChangedEvent) => {
        this.currentPath.set(event.detail.value);
      },
      { signal: this.inputValueChangeAbortController.signal }
    );

    this.#inputRef.set(input);
    input.autocomplete = 'off';
  });

  ngOnInit() {
    const startingPath = this.startingPath();

    if (startingPath) {
      this.currentPath.set(startingPath);
      this.#fetchPathSegmentsRecursively(startingPath);
    } else {
      const roots = this.rootPaths();
      const initial = this.initialNodes();
      if (roots && roots.length > 0) {
        if (initial && initial.length > 0) {
          this.treeNodes.set(
            initial.map((x) => {
              const node: TreeNode = {
                id: x.id,
                leaf: x.leaf,
                cls: x.cls,
                text: this.#getDisplayName(x.text, (x as any)?.Metadata),
                iconCls: x.iconCls,
                kind: x.kind ?? null,
                fileSize: x.fileSize,
                lastModified: (x as any)?.lastModified ?? null,
                resolvedpath: x.resolvedpath,
                parentPath: this.getParentPath(x.id ?? ''),
              } as any as TreeNode;
              return node;
            })
          );
        }
        // A remote root lists through its source; the stand-in node only carries that source
        const rootRemote = this.#rootRemoteSource();
        this.#getPath(rootRemote ? ({ id: roots[0], remoteSource: rootRemote } as FileTreeNode) : null, roots[0]);
      } else {
        this.#getPath(null, ROOTPATH);
      }
    }
  }

  getParentPath(path: string) {
    const sep = this.#getPathDelimiter(path);
    const parts = path.split(sep);
    if (parts.length <= 1) {
      return ROOTPATH;
    }

    parts.pop();
    if (parts.length !== 0) parts.pop();

    const parent = parts.join(sep);
    return parent + sep;
  }

  #treeId = randomUUID();
  #focusedTreePath = signal<string | null>(null);
  // Folders whose listing has been fetched, so an empty folder still counts as expanded.
  #expandedPaths = signal<ReadonlySet<string>>(new Set());
  #typeAhead = '';
  #typeAheadTime = 0;

  visibleTreeRows = computed(() => {
    const rows: { node: FileTreeNode; parent: string | null }[] = [];
    const visit = (nodes: FileTreeNode[], parent: string | null) => {
      for (const node of this.visibleTreeChildren(nodes)) {
        rows.push({ node, parent });
        visit(node.children, node.id ?? null);
      }
    };
    visit(this.treeStructure(), null);
    return rows;
  });

  // Selection state per visible row: null when the row cannot be selected under the current
  // inputs, otherwise the checked/selected value. Computed once per tree change instead of per row.
  #treeSelection = computed(() => {
    const states = new Map<string, boolean | 'mixed' | null>();
    const disabled = this.disabled();
    const multiSelect = this.multiSelect();
    const searchMode = this.searchMode();
    const selectFiles = this.selectFiles();
    const onlySelectFolder = this.onlySelectFolder();
    const accepts = !!this.accepts();
    const mounts = this.#unrootedMounts();

    for (const { node } of this.visibleTreeRows()) {
      const id = node.id ?? '';
      const selectable =
        !disabled &&
        this.#isTreeNodeActionable(node, mounts) &&
        (!searchMode || node.isSearchMatch === true) &&
        node.evalState !== TreeEvalEnum.ExcludedByParent &&
        !(selectFiles && node.cls === 'folder') &&
        !(onlySelectFolder && node.cls !== 'folder') &&
        (!accepts || node.accepted === true);

      let state: boolean | 'mixed' | null = null;
      if (selectable) {
        if (!multiSelect) state = node.evalState === TreeEvalEnum.Included;
        else if (node.evalState === TreeEvalEnum.Included || node.evalState === TreeEvalEnum.IncludedByParent)
          state = true;
        else state = node.isIndeterminate ? 'mixed' : false;
      }
      states.set(id, state);
    }
    return states;
  });

  activeTreePath = computed(() => {
    const rows = this.visibleTreeRows();
    const focused = this.#focusedTreePath();
    if (rows.some(({ node }) => node.id === focused)) return focused;
    return (
      rows.find(({ node }) => this.canSelectTreeNode(node) && node.evalState === TreeEvalEnum.Included)?.node.id ??
      rows[0]?.node.id ??
      null
    );
  });

  #unrootedMounts = computed(
    () =>
      new Set(
        this.#unrootedSources()
          .map((x) => this.#parseRemotePath(x.id)?.mount)
          .filter((x): x is string => !!x)
      )
  );

  // Rows that are neither selectable nor expandable through selection: pagination, the virtual root
  // and the mount folders of unrooted sources.
  #isTreeNodeActionable(node: FileTreeNode, mounts = this.#unrootedMounts()) {
    return !node.isLoadMore && node.id !== ROOTPATH && !mounts.has(node.id ?? '');
  }

  visibleTreeChildren(nodes: FileTreeNode[]) {
    return nodes.filter((node) => node.isLoadMore || !node.hidden || this._showHiddenNodes());
  }

  /**
   * The last-modified time of a node, or null when the listing did not provide a usable one.
   * Unknown timestamps are reported as the .NET default (year 0001) or the Unix epoch and are hidden.
   */
  treeNodeLastModified(node: FileTreeNode): string | null {
    const value = node.lastModified;
    if (!value) return null;
    const time = Date.parse(value);
    if (isNaN(time) || time <= 0) return null;
    return value;
  }

  /** Tooltip for the last-modified time, with the date formatted in the medium locale style. */
  treeNodeLastModifiedTitle(lastModified: string): string {
    const date = this.#datePipe.transform(lastModified, 'medium') ?? lastModified;
    return $localize`Last modified: ${date}:date:`;
  }

  /** Which corner badge to layer over the node's folder/file icon, if any. */
  treeNodeBadge(node: FileTreeNode): TreeNodeBadge | null {
    if (node.symlink) return this.#treeNodeBadges['symlink'];

    // Servers that predate the kind field only mark the home folder by its token
    const kind = node.kind ?? (node.id === '%HOME%' ? 'special:home' : null);
    if (!kind) return null;

    return this.#treeNodeBadges[kind] ?? this.#treeNodeBadges[kind.split(':')[0]] ?? null;
  }

  /** Accessible name for a tree row; badges that convey a state are announced since the badge icon is visual only. */
  treeItemLabel(node: FileTreeNode): string {
    const name = node.text ?? node.id ?? '';
    const badge = this.treeNodeBadge(node);
    return badge?.announce ? $localize`${name}:name: (${badge.label}:state:)` : name;
  }

  treeSetSize(nodes: FileTreeNode[]) {
    return nodes.some((node) => node.isLoadMore) ? -1 : nodes.length;
  }

  treeItemId(node: FileTreeNode) {
    return this.#treeItemIdFor(node.id ?? '');
  }

  #treeItemIdFor(path: string) {
    return this.#treeId + '-item-' + encodeURIComponent(path);
  }

  treeGroupId(node: FileTreeNode) {
    return this.#treeId + '-group-' + encodeURIComponent(node.id ?? '');
  }

  isTreeNodeExpanded(node: FileTreeNode) {
    return node.cls === 'folder' && (node.children.length > 0 || this.#expandedPaths().has(node.id ?? ''));
  }

  canSelectTreeNode(node: FileTreeNode) {
    return this.treeSelectionState(node) !== null;
  }

  treeSelectionState(node: FileTreeNode): boolean | 'mixed' | null {
    return this.#treeSelection().get(node.id ?? '') ?? null;
  }

  toggleMaximized() {
    this.maximized.update((value) => !value);
  }

  // Escape restores the maximized tree; swallow the event so an enclosing dialog does not close as well.
  onDocumentEscape(event: Event) {
    if (!this.maximized() || this.createFolderDialogOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    this.maximized.set(false);
  }

  rememberTreeFocus(node: FileTreeNode) {
    this.#focusedTreePath.set(node.id ?? null);
  }

  #focusTreePath(path: string | null | undefined) {
    if (path == null) return;
    this.#focusedTreePath.set(path);
    const container = this.treeContainerRef()?.nativeElement;
    const element = container?.ownerDocument.getElementById(this.#treeItemIdFor(path));
    if (!element || !container?.contains(element)) return;
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: 'nearest' });
  }

  // After the last page arrives the pagination row is gone; move focus to the last loaded sibling.
  #restoreFocusAfterLoadMore(parentPath: string) {
    afterNextRender(
      () => {
        const siblings = this.visibleTreeRows().filter((row) => row.parent === parentPath);
        this.#focusTreePath(siblings.at(-1)?.node.id ?? parentPath);
      },
      { injector: this.#injector }
    );
  }

  activateTreeNode(event: Event, node: FileTreeNode) {
    if (this.disabled()) return;
    this.#focusTreePath(node.id);
    if (node.isLoadMore) this.loadMore(event, node);
    else this.toggleSelectedNode(event, node);
  }

  toggleTreeNode(event: Event, node: FileTreeNode) {
    if (this.disabled()) return;
    this.#focusTreePath(node.id);
    this.toggleNode(event, node.id ?? '', node);
  }

  onTreeKeydown(event: KeyboardEvent, node: FileTreeNode) {
    if (this.disabled() || event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = this.visibleTreeRows();
    const index = rows.findIndex((row) => row.node.id === node.id);
    if (index < 0) return;
    const handled = ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', ' ', 'Enter'].includes(
      event.key
    );
    if (!handled && event.key.length !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    if (handled) this.#typeAhead = '';
    switch (event.key) {
      case 'ArrowDown':
        this.#focusTreePath(rows[Math.min(index + 1, rows.length - 1)]?.node.id);
        break;
      case 'ArrowUp':
        this.#focusTreePath(rows[Math.max(index - 1, 0)]?.node.id);
        break;
      case 'Home':
        this.#focusTreePath(rows[0]?.node.id);
        break;
      case 'End':
        this.#focusTreePath(rows.at(-1)?.node.id);
        break;
      case 'ArrowRight': {
        if (node.cls !== 'folder') break;
        const firstChild = this.visibleTreeChildren(node.children)[0];
        if (firstChild) this.#focusTreePath(firstChild.id);
        else if (!this.isTreeNodeExpanded(node) && this.isLoading() !== node.id) {
          this.toggleNode(event, node.id ?? '', node);
        }
        break;
      }
      case 'ArrowLeft':
        if (this.isTreeNodeExpanded(node)) this.toggleNode(event, node.id ?? '', node);
        else this.#focusTreePath(rows[index].parent);
        break;
      case ' ':
      case 'Enter':
        if (event.repeat) break;
        this.activateTreeNode(event, node);
        break;
      default: {
        const now = Date.now();
        this.#typeAhead =
          now - this.#typeAheadTime > 700 ? event.key.toLowerCase() : this.#typeAhead + event.key.toLowerCase();
        this.#typeAheadTime = now;
        const query = [...this.#typeAhead].every((char) => char === this.#typeAhead[0])
          ? this.#typeAhead[0]
          : this.#typeAhead;
        const ordered = [...rows.slice(index + 1), ...rows.slice(0, index + 1)];
        const match = ordered.find(
          (row) => !row.node.isLoadMore && (row.node.text ?? '').toLowerCase().startsWith(query)
        );
        if (match) this.#focusTreePath(match.node.id);
      }
    }
  }

  #rangeAnchor: string | null = null;

  #rangeRows(): FileTreeNode[] {
    const rows: FileTreeNode[] = [];
    const visit = (nodes: FileTreeNode[]) => {
      for (const node of nodes) {
        if (node.hidden && !this._showHiddenNodes()) continue;
        if (!node.isLoadMore) rows.push(node);
        visit(node.children);
      }
    };
    visit(this.treeStructure());
    return rows;
  }

  #selectRange(event: MouseEvent, target: FileTreeNode): boolean {
    const rows = this.#rangeRows();
    const start = rows.findIndex((row) => row.id === this.#rangeAnchor);
    const end = rows.findIndex((row) => row.id === target.id);
    if (start < 0 || end < 0) return false;
    const anchor = this.#rangeAnchor;
    event.preventDefault();
    for (const row of rows.slice(Math.min(start, end), Math.max(start, end) + 1)) {
      // Re-evaluate after each selection: a selected folder includes its descendants.
      const current = this.#rangeRows().find((candidate) => candidate.id === row.id);
      if (!current || current.id === ROOTPATH || current.isLoadMore) continue;
      if (this.selectFiles() && current.cls === 'folder') continue;
      if (current.evalState === TreeEvalEnum.Included || current.evalState === TreeEvalEnum.IncludedByParent) continue;
      this.toggleSelectedNode(new Event('click'), current);
    }
    this.#rangeAnchor = anchor;
    return true;
  }

  toggleSelectedNode($event: Event, node: FileTreeNode) {
    if (this.disabled() || !this.#isTreeNodeActionable(node)) return;

    $event.stopPropagation();

    // When only files can be selected, activating a folder expands or collapses it instead
    if (this.selectFiles() && node.cls === 'folder') {
      const reachable = (!this.searchMode() || node.isSearchMatch) && node.evalState !== TreeEvalEnum.ExcludedByParent;
      if (reachable) this.toggleNode($event, node.id as string, node);
      return;
    }

    // Same eligibility rules as the aria-checked/aria-selected state of the row
    if (!this.canSelectTreeNode(node)) return;

    if (this.multiSelect() && $event instanceof MouseEvent && $event.shiftKey && this.#selectRange($event, node))
      return;
    this.#rangeAnchor = node.id ?? null;

    const currentPaths = this.currentPathArray();
    const currentPathsWithRemotes = this.#resolveWithRemoteSource(currentPaths);

    const isChildOfSelected = this.isChildOfSelected(node);
    // Use the resolved path if we are resolving paths
    const nodeId = this.#resolveNodeId(node);
    const pathToTest = isChildOfSelected ? `-${nodeId}` : nodeId!;
    const isFolder = this.#isFolder(nodeId!);

    // Inside a picked folder a click picks or unpicks the entry instead of adding a plain exclude
    if (this.multiSelect() && this.enableIncludePicker() && !currentPathsWithRemotes.includes(nodeId!)) {
      const pick = findIncludePickContaining(currentPaths, nodeId!);
      if (pick) {
        const included = node.evalState === TreeEvalEnum.Included || node.evalState === TreeEvalEnum.IncludedByParent;
        this.currentPath.set(toggleInIncludePick(currentPaths, pick, nodeId!, included).join('\0'));
        return;
      }
    }

    if (this.multiSelect()) {
      if (currentPathsWithRemotes.includes(nodeId!)) {
        // is selected
        this.currentPath.set(
          currentPaths.filter((x) => x !== nodeId && !(isFolder && x.startsWith(pathToTest))).join('\0')
        );
      } else if (currentPathsWithRemotes.some((x) => x == pathToTest)) {
        // is already selected
        this.currentPath.set(currentPaths.filter((x) => x !== pathToTest).join('\0'));
      } else {
        // is not selected, remove subpaths, keep excludes
        const filteredPaths = isFolder ? currentPaths.filter((x) => !x.startsWith(nodeId!)) : currentPaths;
        this.currentPath.set([...filteredPaths, pathToTest].join('\0'));
      }
    } else {
      if (currentPaths.includes(nodeId!)) {
        this.currentPath.set(currentPaths.filter((x) => x !== nodeId).join('\0'));
      } else {
        this.currentPath.set(nodeId!);
      }
    }
  }

  isChildOfSelected(node: FileTreeNode) {
    const currentPaths = this.#resolveWithRemoteSource(this.currentPathArray()).filter((x) => this.#isFolder(x));

    return currentPaths.some((x) => node.id?.startsWith(x) || `-${node.id}`.startsWith(x));
  }

  toggleNode($event: Event, path: string, node: FileTreeNode | null = null) {
    $event.stopPropagation();
    if (node?.cls !== 'folder') return;
    if (this.isTreeNodeExpanded(node)) {
      const prefix = node.id as string;
      this.#expandedPaths.update((paths) => new Set([...paths].filter((x) => !x.startsWith(prefix))));
      this.treeNodes.update((y) => y.filter((z) => !z.id?.startsWith(prefix) || z.id === node.id));
    } else {
      this.#getPath(node, path);
    }
  }

  loadMore($event: Event, node: FileTreeNode) {
    $event.stopPropagation();
    if (!node.isLoadMore) return;
    if (this.isLoading() !== null) return;

    this.#getPath(node, node.parentPath || ROOTPATH, node.loadMoreOffset ?? null);
  }

  openCreateFolderDialog() {
    this.createFolderPath.set(null);
    this.createFolderDialogOpen.set(true);
    return false;
  }

  // The full path of the folder to be created, joined with the separator used by the parent path
  createFolderFullPath = computed(() => {
    const parentPath = this.#appendDirSep(this.currentPathResolved());
    const folderName = this.createFolderPath()?.trim();
    if (!folderName) return parentPath;
    return parentPath + folderName;
  });

  closeCreateFolderDialog(save: boolean) {
    if (save && this.createFolderPath()?.length && this.isCurrentPathFolder()) {
      const path = this.createFolderPath()?.trim();
      if (path) {
        const currentPath = this.currentPath();
        const fullPath = this.#appendDirSep(this.createFolderFullPath());

        defer(() =>
          this.#dupServer.postApiV1RemoteoperationCreate({
            body: {
              path: 'file://' + fullPath,
            },
          })
        ).subscribe({
          next: () => {
            this.currentPath.set(fullPath);
            this.#getPath(null, currentPath);
            setTimeout(() => {
              this.#findActiveNodeAndScrollTo();
            }, 500);
            this.createFolderDialogOpen.set(false);
          },
          error: (err) => {
            const m = err?.message?.match(/user-information\s*:\s*(.*?)(?:\s*,|$)/i);
            const message = m ? m[1] : err?.message || $localize`An error occurred while trying to create the folder.`;

            this.#dialog.open(ConfirmDialogComponent, {
              data: {
                title: $localize`Cannot create folder`,
                message: message,
                confirmText: $localize`OK`,
                cancelText: undefined,
              },
            });
          },
        });
      }
    } else {
      this.createFolderDialogOpen.set(false);
    }
    return false;
  }

  #findActiveNodeAndScrollTo() {
    setTimeout(() => {
      const treeRef = this.treeContainerRef()?.nativeElement;
      const activeNode = treeRef?.querySelector('.active');

      if (activeNode) {
        activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }

  #createCustomInputEventListener(input: HTMLInputElement) {
    Object.defineProperty(input, 'value', {
      configurable: true,
      get() {
        return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.get!.call(this);
      },
      set(newVal) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(this, newVal);

        this.dispatchEvent(
          new CustomEvent('inputValueChanged', {
            bubbles: true,
            cancelable: true,
            detail: {
              value: newVal,
            },
          })
        );

        return newVal;
      },
    });

    return input;
  }

  #getFilePath(path: string, remote: RemoteSource | null | undefined, offset: number | null = null) {
    return this.#listing.list(
      path,
      remote,
      {
        showFiles: this.showFiles,
        backupId: this.backupId,
        destinationUrl: this.destinationUrl,
        connectionStringId: this.connectionStringId,
        sourcePrefix: this.sourcePrefix,
        destinationType: this.destinationType,
        backupSettings: this.backupSettings,
        customRemoteMode: this.customRemoteMode,
        loadExtendedData: this.loadExtendedData,
        isByBackupSettings: this.isByBackupSettings,
      },
      offset
    );
  }

  #fetchPathSegmentsRecursively(path: string) {
    let pathArr = path
      .split('\0')
      .filter((x) => !this.#isFilter(x) && !x.startsWith('@'))
      .filter(Boolean);

    const segmentArr = pathArr.map((x) => {
      const sep = this.#getPathDelimiter(x);
      const split = x.split(sep);

      if (split.at(-1) === '') {
        split.pop();
      }
      if (!this.#isFolder(x)) {
        split.pop();
      }

      return { split, sep };
    });

    let urlPieces: string[] = [ROOTPATH];
    segmentArr.forEach(({ split: segments, sep: pathDelimiter }) => {
      segments.forEach((_, index) => {
        const urlCombined = segments.slice(0, index + 1).join(pathDelimiter) + pathDelimiter;

        if (urlCombined === '' || urlCombined === pathDelimiter) return;

        if (!urlPieces.includes(urlCombined)) {
          urlPieces.push(urlCombined);
        }
      });
    });

    type ResultType<T> = {
      status: 'success' | 'error';
      value: T;
      url: string;
    };

    type FilePathResult = ResultType<GetApiV1BackupByIdFilesResponse | PostApiV1FilesystemResponse>;

    const observables: Observable<FilePathResult>[] = urlPieces.map((urlPiece) => {
      this.isLoading.set(urlPiece);
      return (this.#getFilePath(urlPiece, null) as any).pipe(
        map((data) => ({ status: 'success', value: data, url: urlPiece }) as FilePathResult),
        catchError((err) => of({ status: 'error', value: err, url: urlPiece } as FilePathResult))
      );
    });

    forkJoin(observables)
      .pipe(finalize(() => this.isLoading.set(null)))
      .subscribe({
        next: (res) => {
          const results = res.filter((x) => x.status === 'success') as FilePathResult[];
          const errors = res.filter((x) => x.status === 'error') as FilePathResult[];
          this.treeNodes.update((y) => {
            const allNewNodes = results.flatMap((x) => {
              const items = Array.isArray(x.value) ? x.value : ((x.value as PagedListResult)?.items ?? []);
              return items.map((z) => ({ ...z, parentPath: x.url }));
            });

            if (allNewNodes.length > 0) this.anyRemoteSourcesLoaded.set(true);

            const arrayUniqueByKey = [...new Map([...y, ...allNewNodes].map((item) => [item.id, item])).values()];

            this.#findActiveNodeAndScrollTo();

            if (this.hideShortcuts()) {
              return arrayUniqueByKey.filter((x: TreeNode) => !x.id!.startsWith('%')) as TreeNode[];
            } else {
              return arrayUniqueByKey as TreeNode[];
            }
          });
        },
      });
  }

  #getDisplayName(text?: string | null, metadata?: { [key: string]: string | null } | null): string | undefined | null {
    if (metadata) {
      const name =
        metadata['o365:Name'] ||
        metadata['o365:DisplayName'] ||
        metadata['gsuite:Name'] ||
        metadata['gsuite:DisplayName'] ||
        metadata['diskimage:Name'] ||
        metadata['hyperv:Name'] ||
        metadata['mssql:Name'];
      if (name) return name;
    }
    return text;
  }

  #detectExtendData(metadata: { [key: string]: string | null } | null) {
    // Detect extended data in backup
    if (metadata && metadata['ExtType'] && metadata['ExtType'].length > 0) {
      this.hasExtendedData.emit(metadata['ExtType']);
    }
    // Backups of disks do not have the ExtType metadata set
    else if (metadata && metadata['diskimage:Type'] && metadata['diskimage:Type'].length > 0) {
      this.hasExtendedData.emit('diskimage');
    }
  }

  #isFolder(path: string): boolean {
    return isFolderPath(path);
  }

  #isFilter(path: string): boolean {
    return path.startsWith('+') || path.startsWith('-');
  }

  #createLoadMoreNode(parentPath: string, remote: RemoteSource | null | undefined, nextOffset: number): TreeNode {
    return {
      id: `${parentPath}${LOAD_MORE_ID_SUFFIX}`,
      text: $localize`Load more`,
      cls: 'load-more',
      leaf: true,
      hidden: false,
      parentPath: parentPath,
      remoteSource: remote ?? undefined,
      isLoadMore: true,
      loadMoreOffset: nextOffset,
    } as any as TreeNode;
  }

  #getPath(node: FileTreeNode | null = null, newPath = ROOTPATH, offset: number | null = null) {
    const remote = node?.remoteSource;
    this.isLoading.set(node?.isLoadMore ? (node.id ?? newPath) : newPath);

    (this.#getFilePath(newPath, remote, offset) as Observable<any>)
      .pipe(finalize(() => this.isLoading.set(null)))
      .subscribe({
        next: (x) => {
          const result: PagedListResult = Array.isArray(x)
            ? { items: x, hasMore: false, nextOffset: 0 }
            : { items: x?.items ?? [], hasMore: x?.hasMore ?? false, nextOffset: x?.nextOffset ?? 0 };

          let alignDataArray =
            this.isByBackupSettings() || this.customRemoteMode() !== null || remote
              ? result.items.map(
                  (y: {
                    Path: string;
                    Size: number;
                    IsSymlink?: boolean;
                    LastModified?: string | null;
                    Metadata: { [key: string]: string | null } | null;
                  }) => {
                    this.#detectExtendData(y.Metadata);
                    const sep = this.#getPathDelimiter(y.Path);
                    const text = this.#getDisplayName(
                      y.Path.split(sep)
                        .filter((part: string) => part !== '')
                        .pop(),
                      y.Metadata
                    );

                    let id = y.Path;
                    let newRemoteSource: RemoteSource | null = null;
                    let cls = this.#isFolder(y.Path) ? 'folder' : 'file';
                    const metadata = y.Metadata;

                    if (remote) {
                      id = y.Path.substring(1); // Remove leading @ for the path to match the tree
                      newRemoteSource = {
                        ...remote,
                        path: y.Path.substring(remote.prefix.length),
                      };
                    }

                    if (metadata) {
                      // Don't show geometry
                      if (metadata['diskimage:Type'] === 'geometry') return null;
                      // Don't show partitioninfo
                      if (metadata['diskimage:Type'] === 'partitioninfo') return null;
                      // Don't show filesystems
                      if (metadata['diskimage:Type'] === 'filesystem') return null;
                    }

                    return {
                      text: text,
                      id: id,
                      cls: cls,
                      leaf: node !== null,
                      resolvedpath: y.Path,
                      hidden: false,
                      symlink: y.IsSymlink ?? false,
                      remoteSource: newRemoteSource,
                      fileSize: y.Size,
                      lastModified: y.LastModified ?? null,
                    };
                  }
                )
              : result.items;

          if (alignDataArray.length > 0) this.anyRemoteSourcesLoaded.set(true);

          this.treeNodes.update((y) => {
            const newArray = alignDataArray
              .filter((f: any) => f !== null)
              .map((z: any) => {
                const cls = z.cls ?? (this.#isFolder(z.id) ? 'folder' : 'file');

                return {
                  ...z,
                  cls,
                  parentPath: newPath,
                };
              });

            // Remove the consumed (or stale) "load more" node for this path
            const loadMoreId = `${newPath}${LOAD_MORE_ID_SUFFIX}`;
            let merged = [...y, ...newArray].filter((n) => n.id !== loadMoreId);

            // If the server has more items, append a fresh "load more" node
            if (result.hasMore) {
              merged.push(this.#createLoadMoreNode(newPath, remote, result.nextOffset));
            }

            const arrayUniqueByKey = [...new Map(merged.map((item) => [item.id, item])).values()];

            if (this.hideShortcuts()) {
              return arrayUniqueByKey.filter((x: TreeNode) => !x.id!.startsWith('%')) as TreeNode[];
            } else {
              return arrayUniqueByKey as TreeNode[];
            }
          });

          this.#expandedPaths.update((paths) => (paths.has(newPath) ? paths : new Set([...paths, newPath])));

          if (node?.isLoadMore && !result.hasMore && this.#focusedTreePath() === node.id) {
            this.#restoreFocusAfterLoadMore(newPath);
          }
        },
        error: (err) => {
          this.errorMessage.set(err.message);
          if (this.anyRemoteSourcesLoaded()) {
            setTimeout(() => {
              this.errorMessage.set(null);
            }, 5000);
          }
        },
      });
  }
}
