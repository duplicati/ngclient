import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ShipButton,
  ShipButtonGroup,
  ShipDialog,
  ShipDialogService,
  ShipFormField,
  ShipIcon,
  ShipList,
  ShipProgressBar,
  ShipToggle,
} from '@ship-ui/core';
import { catchError, finalize, forkJoin, map, Observable, of } from 'rxjs';
import {
  DuplicatiServer,
  GetApiV1BackupByIdFilesData,
  GetApiV1BackupByIdFilesResponse,
  PostApiV1FilesystemResponse,
  SearchEntriesItemDto,
  TreeNodeDto,
} from '../../openapi';
import { BytesPipe } from '../../pipes/byte.pipe';
import { SysinfoState } from '../../states/sysinfo.state';
import { ConfirmDialogComponent } from '../confirm-dialog/confirm-dialog.component';

enum TreeEvalEnum {
  ExcludedByParent = -2,
  Excluded = -1,
  None = 0,
  Included = 1,
  IncludedByParent = 2,
}

type TreeNode = TreeNodeDto & {
  accepted?: boolean;
  parentPath: string;
};

type FileTreeNode = TreeNode & {
  children: FileTreeNode[];
  evalState: TreeEvalEnum;
  isIndeterminate: boolean;
  isSearchMatch?: boolean;
  isGenerated?: boolean;
  hasChildrenInSearch?: boolean;
};

type InputValueChangedEvent = CustomEvent<{ value: string }>;

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

export type BackupSettings = {
  id: string;
  time: string;
};

// The virtual root path for the file tree, also used for Windows as the root path.
const ROOTPATH = '/';

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
  ],
  templateUrl: './file-tree.component.html',
  styleUrl: './file-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export default class FileTreeComponent {
  #dupServer = inject(DuplicatiServer);
  #sysInfo = inject(SysinfoState);
  #dialog = inject(ShipDialogService);

  multiSelect = input(false);
  disabled = input(false);
  showFiles = input(false);
  selectFiles = input(false);
  accepts = input<string | null | undefined>(null);
  startingPath = input<string | null>(null);
  rootPaths = input<string[]>([]);
  initialNodes = input<TreeNodeDto[]>([]);
  backupSettings = input<BackupSettings | null>(null);
  pathRefreshTrigger = input(false);
  showHiddenNodes = input(false);
  enableCreateFolder = input(false);
  hideShortcuts = input(false);
  customRemoteMode = input<'gsuite' | 'o365' | 'diskimage' | null>(null);
  backupId = input<string | null | undefined>('');
  sourcePrefix = input<string | null | undefined>('');
  destinationUrl = input<string | null | undefined>('');
  loadExtendedData = input(true);
  hasExtendedData = output<string>();
  searchMode = input(false);
  searchResults = input<SearchEntriesItemDto[]>([]);

  _showHiddenNodes = signal(false);
  createFolderDialogOpen = signal(false);
  createFolderPath = signal<string | null>(null);

  treeContainerRef = viewChild<ElementRef<HTMLDivElement>>('treeContainer');
  formRef = viewChild<ElementRef<HTMLFormElement>>('formRef');
  pathDiscoveryMethod = signal<'browse' | 'path'>('browse');
  isLoading = signal<string | null>(null);
  currentPath = signal<string>('');
  currentPathResolvedShorthands = computed(() => this.#sysInfo.resolveShorthandPath(this.currentPath()));
  #inputRef = signal<HTMLInputElement | null>(null);
  treeSearchQuery = signal<string>('');
  treeNodes = signal<TreeNode[]>([]);
  pathDelimiter = computed(() => this.#sysInfo.systemInfo()?.DirectorySeparator ?? '');

  filterGroups = this.#sysInfo.filterGroups();
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

  TreeEvalEnum = TreeEvalEnum;

  // Build tree structure from search results
  searchResultTreeStructure = computed<FileTreeNode[]>(() => {
    const searchResults = this.searchResults();
    if (searchResults.length === 0) {
      return [];
    }

    const currentPaths = this.currentPath()
      .split('\0')
      .filter((x) => x !== '' && x !== ROOTPATH);
    const showHiddenNodes = this.showHiddenNodes();

    // Build path info map from search results
    const pathInfoMap = new Map<
      string,
      { part: string; parentPath: string; isFolder: boolean; match: SearchEntriesItemDto | null }
    >();

    for (const searchEntry of searchResults) {
      const resultPath = searchEntry.Path ?? '';
      const pathDelimiter = this.#getPathDelimiter(resultPath);
      const parts = resultPath.split(pathDelimiter).filter((p) => p !== '');

      let currentPath = '';
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLastPart = i === parts.length - 1;
        const isFolder = !isLastPart || this.#isFolder(resultPath);

        const parentPath = currentPath || ROOTPATH;
        const prefix = currentPath
          ? currentPath.endsWith(pathDelimiter)
            ? currentPath.slice(0, -pathDelimiter.length)
            : currentPath
          : '';
        currentPath = prefix ? `${prefix}${pathDelimiter}${part}` : `${pathDelimiter}${part}`;
        if (isFolder && !currentPath.endsWith(pathDelimiter)) {
          currentPath += pathDelimiter;
        }

        if (!pathInfoMap.has(currentPath)) {
          pathInfoMap.set(currentPath, {
            part,
            parentPath,
            isFolder,
            match: isLastPart ? searchEntry : null,
          });
        } else if (isLastPart) {
          const existing = pathInfoMap.get(currentPath)!;
          existing.match = searchEntry;
        }
      }
    }

    // Build children map
    const childrenMap = new Map<string, string[]>();
    for (const [path, info] of pathInfoMap) {
      if (!childrenMap.has(info.parentPath)) {
        childrenMap.set(info.parentPath, []);
      }
      childrenMap.get(info.parentPath)!.push(path);
    }

    // Determine which paths are "visible" (not collapsed into a parent chain)
    // and what their collapsed display text should be
    const visiblePaths = new Set<string>();
    const collapsedTextMap = new Map<string, string>(); // visible path -> display text

    for (const [path, info] of pathInfoMap) {
      if (!info.isFolder) {
        // Files are always visible
        visiblePaths.add(path);
        continue;
      }

      // A folder is hidden (collapsed into its parent) if:
      // - Its parent has exactly ONE child total
      // - AND that one child is this folder
      //
      // This means the folder is just a passthrough with no siblings.
      // We collapse it into the nearest visible ancestor.

      const parentChildren = childrenMap.get(info.parentPath) || [];
      const isOnlyChild = parentChildren.length === 1 && parentChildren[0] === path;

      if (isOnlyChild && info.parentPath !== ROOTPATH) {
        // This folder is hidden - collapsed into parent
        continue;
      }

      // This folder is visible
      visiblePaths.add(path);

      // Build collapsed text if this folder starts a single-child chain
      // Walk down the chain and concatenate names
      let chainText = info.part;
      let chainPath = path;
      while (true) {
        const chainChildren = childrenMap.get(chainPath) || [];
        if (chainChildren.length !== 1) break;

        const nextPath = chainChildren[0];
        const nextInfo = pathInfoMap.get(nextPath);
        if (!nextInfo || !nextInfo.isFolder) break;

        chainText += '/' + nextInfo.part;
        chainPath = nextPath;
      }

      // Only set collapsed text if we actually collapsed something
      if (chainPath !== path) {
        collapsedTextMap.set(path, chainText);
      }
    }

    // Also make root visible
    visiblePaths.add(ROOTPATH);

    // Build the tree without a root node
    // Top-level items are direct children of an implicit root
    const topLevelNodes: FileTreeNode[] = [];
    const nodeMap = new Map<string, FileTreeNode>();

    // Sort visible paths by depth
    const sortedPaths = Array.from(visiblePaths)
      .filter((p) => p !== ROOTPATH)
      .sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));

    for (const path of sortedPaths) {
      const info = pathInfoMap.get(path);
      if (!info) continue;

      // Find the actual parent in the visible tree
      let parentPath = info.parentPath;
      while (parentPath !== ROOTPATH && !visiblePaths.has(parentPath)) {
        const parentInfo = pathInfoMap.get(parentPath);
        parentPath = parentInfo?.parentPath || ROOTPATH;
      }

      // Check if a node with this id already exists
      if (nodeMap.has(path)) continue;

      const displayText = this.#getDisplayName(collapsedTextMap.get(path), info.match?.Metadata) ?? info.part;
      const isGenerated = info.match === null;

      const evalState =
        info.match !== null && !info.isFolder && showHiddenNodes
          ? TreeEvalEnum.None
          : this.#eval(currentPaths, path, info.isFolder ? 'folder' : 'file', null);

      const newNode: FileTreeNode = {
        id: path,
        resolvedpath: path,
        text: displayText,
        parentPath: parentPath,
        children: [],
        evalState: evalState,
        isIndeterminate: this.isIndeterminate(currentPaths, path),
        cls: info.isFolder ? 'folder' : 'file',
        isSearchMatch: info.match !== null,
        isGenerated: isGenerated,
        hasChildrenInSearch: (childrenMap.get(path)?.length || 0) > 0,
        iconCls: null,
        check: false,
        leaf: !info.isFolder,
        hidden: false,
        systemFile: false,
        temporary: false,
        symlink: false,
        fileSize: info.match?.Size ?? 0,
      };

      nodeMap.set(path, newNode);

      if (parentPath === ROOTPATH) {
        topLevelNodes.push(newNode);
      } else {
        const parentNode = nodeMap.get(parentPath);
        if (parentNode) {
          parentNode.children.push(newNode);
        }
      }
    }

    // Sort children alphabetically, folders first
    const sortNodes = (nodes: FileTreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.cls === 'folder' && b.cls !== 'folder') return -1;
        if (a.cls !== 'folder' && b.cls === 'folder') return 1;
        return (a.text ?? '').localeCompare(b.text ?? '');
      });
      nodes.forEach((node) => sortNodes(node.children));
    };
    sortNodes(topLevelNodes);

    return topLevelNodes;
  });

  treeStructure = computed<FileTreeNode[]>(() => {
    if (this.searchMode()) {
      return this.searchResultTreeStructure();
    }

    const showHiddenNodes = this.showHiddenNodes();
    const _currentPaths = this.currentPath()
      .split('\0')
      .filter((x) => x !== '' && x !== ROOTPATH);

    let currentPaths = structuredClone(_currentPaths);

    for (let index = 0; index < currentPaths.length; index++) {
      const path = currentPaths[index];
      const x = path.slice(1);

      if (x.startsWith('{') && x.endsWith('}')) {
        const groupName = x.slice(1, -1);

        const filterGroup = this.filterGroups?.['FilterGroups'][groupName];

        if (filterGroup && filterGroup.length) {
          const _filterGroup = filterGroup.map((x) => `-${x}`);
          currentPaths.splice(index, 1, ..._filterGroup);
        }
      }
    }

    const nodes = this.searchableTreeNodes();
    const rootPaths = this.rootPaths();
    const accepts = this.accepts();

    let roots: FileTreeNode[] = [];

    if (rootPaths.length > 0) {
      roots = rootPaths.map((rootPath) => {
        const evalState = this.#eval(currentPaths, rootPath, 'folder', null);

        return {
          id: rootPath,
          resolvedpath: rootPath,
          text: rootPath,
          parentPath: '',
          children: [],
          evalState: evalState,
          isIndeterminate: false,
          cls: this.#isFolder(rootPath) ? 'folder' : 'file',
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
        const evalState =
          node.hidden === true && showHiddenNodes
            ? TreeEvalEnum.None
            : this.#eval(currentPaths, nodePath, node.cls, parentNode);

        const newNode: FileTreeNode = {
          ...node,
          isIndeterminate: this.isIndeterminate(currentPaths, nodePath),
          evalState: evalState,
          children: [],
        };

        if (accepts) {
          newNode.accepted = this.matchAccepts(accepts, newNode);
        }

        nodeMap.set(nodePath, newNode);
        if (newNode.id?.startsWith('%') && newNode.id?.endsWith('%'))
          nodeMap.set(this.#appendDirSep(nodePath), newNode);
        if (parentNode) {
          parentNode.children.push(newNode);
        }
      }

      return root;
    });
    return roots;
  });

  #appendDirSep(path?: string | null) {
    if (!path) return ROOTPATH;
    const pathDelimiter = this.#getPathDelimiter(path);
    if (path.endsWith('/') || path.endsWith('\\') || path === ROOTPATH) return path;
    return path + pathDelimiter;
  }

  #eval(
    currentPaths: string[],
    nodeId: string,
    nodeType: string,
    parentNode: FileTreeNode | null | undefined
  ): TreeEvalEnum {
    if (parentNode && parentNode.evalState === TreeEvalEnum.Excluded) return TreeEvalEnum.ExcludedByParent;

    let result = TreeEvalEnum.None;

    const pathsWithoutDir = currentPaths.filter((x) => !x.startsWith('-') && !x.startsWith('+'));
    const pathsWithDir = currentPaths.filter((x) => x.startsWith('-') || x.startsWith('+'));
    const isMultiSelect = this.multiSelect();

    if (pathsWithoutDir.length === 0) return result;

    for (let index = 0; index < pathsWithoutDir.length; index++) {
      const x = pathsWithoutDir[index];
      if (nodeId === x) {
        result = TreeEvalEnum.Included;
        break;
      }

      if (!isMultiSelect || !this.#isFolder(x)) continue;

      const res = nodeId?.startsWith(x);

      if (res) {
        result = TreeEvalEnum.Included;
        break;
      }
    }

    if (pathsWithDir.length === 0) return result;

    for (let i = 0; i < pathsWithDir.length; i++) {
      const pathPart = pathsWithDir[i];
      const x = pathPart.slice(1);
      const dir = pathPart.startsWith('-') ? TreeEvalEnum.Excluded : TreeEvalEnum.Included;

      if (this.#isFolder(x)) {
        // Works - Folder
        if (nodeType !== 'folder') continue;
        const res = nodeId === x;

        if (res) {
          result = dir;

          break;
        }
      }

      if (x.startsWith('*') && (x.endsWith(`*\\`) || x.endsWith('*/'))) {
        // Works - FolderNameIncludes
        if (nodeType !== 'folder') continue;
        const trimmedX = x.slice(1, -2);

        if (trimmedX === '') break;

        const res = nodeId?.includes(trimmedX + '\\') || nodeId?.includes(trimmedX + '/');

        if (res) {
          result = dir;
          break;
        }
      }

      if (x.startsWith('[.*') && (x.endsWith(`[^\\/]*]`) || x.endsWith(`[^\\\\]*]`))) {
        // Works - FileNameIncludes
        if (nodeType !== 'file') continue;

        const regexPattern = x.slice(3, -7);
        const regex = new RegExp(regexPattern);
        const res = regex.test(nodeId!);

        if (res) {
          result = dir;
          break;
        }
      }

      if (x.startsWith('[') && x.endsWith(']')) {
        // Works - Regex
        const regexPattern = x.slice(1, -1);
        const jsRegex = this.translateCSharpRegex(regexPattern);
        const regex = new RegExp(`${jsRegex}`);
        const res = regex.test(nodeId!);

        if (res) {
          result = dir;
          break;
        }
      }

      if (x.startsWith('*.')) {
        // Works - File Extension globbing
        if (nodeType !== 'file') continue;
        if (x.replace('*.', '').length === 0) continue;

        const res = this.#globMatch(nodeId!, x, true);

        if (res) {
          result = dir;
          break;
        }
      }

      // Works - Expression
      if (x === '') continue;

      // Matching file or folder
      if (x === nodeId) {
        result = dir;
        break;
      }

      const res = this.#globMatch(nodeId!, x, true);

      if (res) {
        result = dir;
        break;
      }
    }

    return result;
  }

  translateCSharpRegex(csharpRegex: string) {
    let jsRegex = csharpRegex;

    // 1. Remove verbatim string literal indicator (@)
    jsRegex = jsRegex.replace(/^@/, '');

    // 2. Handle named capture groups
    //    (This is a simplification - it won't handle nested groups perfectly)
    const namedGroupRegex = /\(\?<(?<name>\w+)>(?<pattern>[^)]+)\)/g;
    jsRegex = jsRegex.replace(namedGroupRegex, (match, name, pattern) => `(${pattern})`);

    // TODO - Add lookbehind polyfill

    // 3. Escape backslashes
    jsRegex = jsRegex.replace(/\\/g, '\\\\');

    return jsRegex;
  }

  isIndeterminate(currentPaths: string[], nodeId: string) {
    return currentPaths.filter((x) => !x.startsWith('-') && this.#isFolder(x)).some((x) => x.startsWith(nodeId));
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

  #globMatch(str: string, pattern: string, evaluateFullPath = false): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[!([^\]]+)\]/g, '[^$1]');

    const regex = new RegExp(`${regexPattern}${evaluateFullPath ? '$' : ''}`);

    return regex.test(str);
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
                fileSize: x.fileSize,
                resolvedpath: x.resolvedpath,
                parentPath: this.getParentPath(x.id ?? ''),
              } as any as TreeNode;
              return node;
            })
          );
        }
        this.#getPath(null, roots[0]);
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

  toggleSelectedNode($event: Event, node: FileTreeNode) {
    if (node.id === ROOTPATH) return;

    $event.stopPropagation();

    // In search mode, only allow selecting search matches
    if (this.searchMode() && !node.isSearchMatch) return;

    if (node.evalState === TreeEvalEnum.ExcludedByParent) return;

    if (this.selectFiles() && node.cls === 'folder') {
      this.toggleNode(node.id as string, node);
      return;
    }

    const accepts = this.accepts();

    if (accepts && !node.accepted) return;

    const currentPaths = this.currentPath()
      .split('\0')
      .filter((x) => x !== '' && x !== ROOTPATH);

    const isChildOfSelected = this.isChildOfSelected(node);
    const pathToTest = isChildOfSelected ? `-${node.id}` : node.id!;
    const isFolder = this.#isFolder(node.id!);

    if (this.multiSelect()) {
      if (currentPaths.includes(node.id!)) {
        // is selected
        this.currentPath.set(
          currentPaths.filter((x) => x !== node.id && !(isFolder && x.startsWith(pathToTest))).join('\0')
        );
      } else if (currentPaths.some((x) => x == pathToTest)) {
        // is already selected
        this.currentPath.set(currentPaths.filter((x) => x !== pathToTest).join('\0'));
      } else {
        // is not selected, remove subpaths, keep excludes
        const filteredPaths = isFolder ? currentPaths.filter((x) => !x.startsWith(node.id!)) : currentPaths;
        this.currentPath.set([...filteredPaths, pathToTest].join('\0'));
      }
    } else {
      if (currentPaths.includes(node.id!)) {
        this.currentPath.set(currentPaths.filter((x) => x !== node.id).join('\0'));
      } else {
        this.currentPath.set(node.id!);
      }
    }
  }

  isChildOfSelected(node: FileTreeNode) {
    const currentPaths = this.currentPath()
      .split('\0')
      .filter((x) => x !== '' && x !== ROOTPATH && this.#isFolder(x));

    return currentPaths.some((x) => node.id?.startsWith(x) || `-${node.id}`.startsWith(x));
  }

  toggleNode(path: string, node: FileTreeNode | null = null) {
    if (node?.cls === 'folder') {
      if (node?.children.length) {
        this.treeNodes.update((y) => y.filter((z) => !z.id?.startsWith(node.id as string) || z.id === node.id));
      } else {
        this.#getPath(node, path);
      }
    }
  }

  openCreateFolderDialog() {
    this.createFolderPath.set(null);
    this.createFolderDialogOpen.set(true);
    return false;
  }

  closeCreateFolderDialog(save: boolean) {
    if (save && this.createFolderPath()?.length && this.isCurrentPathFolder()) {
      const path = this.createFolderPath()?.trim();
      if (path) {
        const currentPath = this.currentPath();
        const resolvedCurrentPath = this.currentPathResolvedShorthands();
        const newPath = this.#appendDirSep(path);
        const fullPath = `${resolvedCurrentPath}/${newPath}`;

        this.#dupServer
          .postApiV1RemoteoperationCreate({
            requestBody: {
              path: 'file://' + fullPath,
            },
          })
          .subscribe({
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
              const message = m
                ? m[1]
                : err?.message || $localize`An error occurred while trying to create the folder.`;

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

  #getFilesystemPath(path: string) {
    return this.#dupServer.postApiV1Filesystem({
      showHidden: true,
      requestBody: {
        path,
      },
      onlyFolders: !this.showFiles(),
    });
  }

  #getOffice365Files(path: string | null) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'office365',
        requestBody: {
          'backup-id': this.backupId() ?? '',
          'source-prefix': this.sourcePrefix() ?? '',
          operation: 'ListDestinationRestoreTargets',
          url: this.destinationUrl() ?? '',
          path: path ?? '/',
        },
      })
      .pipe(
        map((res) => {
          const d = res.Result as {
            [key: string]: string;
          };
          return Object.keys(d).map((key) => {
            return {
              Path: key,
              Metadata: JSON.parse(d[key]),
            };
          });
        })
      );
  }

  #getGoogleWorkspaceFiles(path: string | null) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'googleworkspace',
        requestBody: {
          'backup-id': this.backupId() ?? '',
          'source-prefix': this.sourcePrefix() ?? '',
          operation: 'ListDestinationRestoreTargets',
          url: this.destinationUrl() ?? '',
          path: path ?? '/',
        },
      })
      .pipe(
        map((res) => {
          const d = res.Result as {
            [key: string]: string;
          };
          return Object.keys(d).map((key) => {
            return {
              Path: key,
              Metadata: JSON.parse(d[key]),
            };
          });
        })
      );
  }

  #getDiskImagePaths(path: string | null) {
    return this.#dupServer
      .postApiV1WebmoduleByModulekey({
        modulekey: 'diskimage',
        requestBody: {
          operation: 'ListDestinationRestoreTargets',
          path: path ?? '/',
        },
      })
      .pipe(
        map((res) => {
          const d = res.Result as {
            [key: string]: string;
          };
          return Object.keys(d).map((key) => {
            return {
              Path: key,
              Metadata: JSON.parse(d[key]),
            };
          });
        })
      );
  }

  #getBackupFiles(path: string | null) {
    const backupSettings = this.backupSettings()!;
    if (this.#sysInfo.hasV2ListOperations()) {
      return this.#dupServer
        .postApiV2BackupListFolder({
          requestBody: {
            BackupId: backupSettings.id,
            Time: backupSettings.time,
            Paths: path ? [path] : null,
            PageSize: 0, // TODO: Add pagination support
            Page: 0,
            ReturnExtended: this.customRemoteMode() !== null || this.loadExtendedData(),
          },
        })
        .pipe(map((res) => res.Data ?? []));
    } else {
      const params: GetApiV1BackupByIdFilesData = {
        id: backupSettings.id + '',
        prefixOnly: false,
        folderContents: true,
        time: backupSettings.time,
        filter: path ? '@' + path : undefined,
      };

      return this.#dupServer.getApiV1BackupByIdFiles(params).pipe(map((res) => res['Files'] ?? []));
    }
  }

  #getFilePath(path: string) {
    if (this.customRemoteMode() === 'o365') {
      return this.#getOffice365Files(path);
    }

    if (this.customRemoteMode() === 'gsuite') {
      return this.#getGoogleWorkspaceFiles(path);
    }

    if (this.customRemoteMode() === 'diskimage') {
      return this.#getDiskImagePaths(path);
    }

    if (this.isByBackupSettings()) {
      return this.#getBackupFiles(path);
    }

    return this.#getFilesystemPath(path);
  }

  #fetchPathSegmentsRecursively(path: string) {
    let pathArr = path
      .split('\0')
      .filter((x) => !x.startsWith('-') && !x.startsWith('+') && !x.startsWith('@'))
      .filter(Boolean);

    const segmentArr = pathArr.map((x) => {
      const sep = this.#getPathDelimiter(x);
      const split = x.split(sep);

      if (split.at(-1) !== '') {
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
      return (this.#getFilePath(urlPiece) as any).pipe(
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
              if (Array.isArray(x.value)) {
                return x.value.map((z) => ({ ...z, parentPath: x.url }));
              }
              return [];
            });

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
        metadata['diskimage:Name'];
      if (name) return name;
    }
    return text;
  }

  #detectExtendData(metadata: { [key: string]: string | null } | null) {
    // Detect extended data in backup
    if (metadata && metadata['ExtType'] && metadata['ExtType'].length > 0) {
      this.hasExtendedData.emit(metadata['ExtType']);
    }
  }

  #isFolder(path: string): boolean {
    return (
      (path.startsWith('%') && path.endsWith('%') && !path.includes('/') && !path.includes('\\')) ||
      path.endsWith('/') ||
      path.endsWith('\\')
    );
  }

  #getPath(node: FileTreeNode | null = null, newPath = ROOTPATH) {
    this.isLoading.set(newPath);

    (this.#getFilePath(newPath) as Observable<any>).pipe(finalize(() => this.isLoading.set(null))).subscribe({
      next: (x) => {
        let alignDataArray =
          this.isByBackupSettings() || this.customRemoteMode() !== null
            ? x.map((y: { Path: string; Size: number; Metadata: { [key: string]: string | null } | null }) => {
                this.#detectExtendData(y.Metadata);
                const sep = this.#getPathDelimiter(y.Path);
                const text = this.#getDisplayName(
                  y.Path.split(sep)
                    .filter((part: string) => part !== '')
                    .pop(),
                  y.Metadata
                );
                return {
                  text: text,
                  id: y.Path,
                  cls: this.#isFolder(y.Path) ? 'folder' : 'file',
                  leaf: node !== null,
                  resolvedpath: y.Path,
                  hidden: false,
                  fileSize: y.Size,
                };
              })
            : x;

        this.treeNodes.update((y) => {
          const newArray = alignDataArray.map((z: any) => {
            const cls = this.#isFolder(z.id) ? 'folder' : 'file';

            return {
              ...z,
              cls,
              parentPath: newPath,
            };
          });

          const arrayUniqueByKey = [...new Map([...y, ...newArray].map((item) => [item.id, item])).values()];

          if (this.hideShortcuts()) {
            return arrayUniqueByKey.filter((x: TreeNode) => !x.id!.startsWith('%')) as TreeNode[];
          } else {
            return arrayUniqueByKey as TreeNode[];
          }
        });
      },
    });
  }
}
