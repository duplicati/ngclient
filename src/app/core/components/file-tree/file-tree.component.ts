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
  SparkleButtonGroupComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleListComponent,
  SparkleProgressBarComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { catchError, finalize, forkJoin, map, Observable, of } from 'rxjs';
import {
  DuplicatiServerService,
  GetApiV1BackupByIdFilesData,
  GetApiV1BackupByIdFilesResponse,
  PostApiV1FilesystemResponse,
  TreeNodeDto,
} from '../../openapi';
import { SysinfoState } from '../../states/sysinfo.state';

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
    SparkleButtonGroupComponent,
    SparkleToggleComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleListComponent,
    SparkleProgressBarComponent,
    NgTemplateOutlet,
    FormsModule,
  ],
  templateUrl: './file-tree.component.html',
  styleUrl: './file-tree.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.disabled]': 'disabled()',
  },
})
export default class FileTreeComponent {
  #dupServer = inject(DuplicatiServerService);
  #sysInfo = inject(SysinfoState);

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
  hideShortcuts = input(false);
  includes = output<string[]>();
  excludes = output<string[]>();

  _showHiddenNodes = signal(false);
  treeContainerRef = viewChild<ElementRef<HTMLDivElement>>('treeContainer');
  formRef = viewChild<ElementRef<HTMLFormElement>>('formRef');
  pathDiscoveryMethod = signal<'browse' | 'path'>('browse');
  isLoading = signal(false);
  currentPath = signal<string>('/');
  #inputRef = signal<HTMLInputElement | null>(null);
  treeSearchQuery = signal<string>('');
  treeNodes = signal<TreeNode[]>([]);
  isWindows = computed(() => this.#sysInfo.systemInfo()?.OSType === 'Windows');
  pathDelimiter = computed(() => (this.isWindows() ? '\\' : '/'));

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
  treeStructure = computed<FileTreeNode[]>(() => {
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
    const pathDelimiter = this.pathDelimiter();

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
          cls: this.#isFolder(rootPath, pathDelimiter) ? 'folder' : 'file'
        };
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
        },
      ];
    }

    roots.map((root) => {
      const nodeMap = new Map<string, FileTreeNode>();
      const rootPath = root?.id!;

      if (accepts) {
        root.accepted = true;
      }

      nodeMap.set(root.id!, root);

      const filteredNodes = rootPaths.length > 0 ? nodes.filter((x) => x.parentPath.startsWith(root.id!)) : nodes;

      for (const node of filteredNodes) {
        const itemPath = rootPaths.length > 0 ? (node.id as string).replace(rootPath ?? '', '') : node.id!;
        const pathParts = itemPath.split(pathDelimiter).filter(Boolean);

        let evaluatedPath = '';
        let parentNode = root;

        for (const part of pathParts) {
          evaluatedPath += part + pathDelimiter;

          if (!nodeMap.has(evaluatedPath)) {
            const evalState =
              node.hidden === true && showHiddenNodes
                ? TreeEvalEnum.None
                : this.#eval(currentPaths, node.id!, node.cls!, parentNode);

            const newNode: FileTreeNode = {
              id: node.id,
              isIndeterminate: this.isIndeterminate(currentPaths, node.id!),
              evalState,
              parentPath: evaluatedPath,
              resolvedpath: node.cls == 'folder' ? this.#appendDirSep(node.resolvedpath) : evaluatedPath,
              hidden: node.hidden,
              text: node.text,
              cls: node.cls,
              children: [],
            };

            if (accepts) {
              newNode.accepted = this.matchAccepts(accepts, newNode);
            }

            nodeMap.set(evaluatedPath, newNode);
            parentNode.children.push(newNode);
          }

          parentNode = nodeMap.get(evaluatedPath)!;
        }
      }

      return root;
    });

    return roots;
  });

  #appendDirSep(path?: string | null) {
    const pathDelimiter = this.pathDelimiter();
    if (!path) return ROOTPATH;
    if (path.endsWith(pathDelimiter) || path === ROOTPATH) return path;
    return path + pathDelimiter;
  }

  #eval(currentPaths: string[], nodeId: string, nodeType: string, parentNode: FileTreeNode | null): TreeEvalEnum {
    if (parentNode && parentNode.evalState === TreeEvalEnum.Excluded) return TreeEvalEnum.ExcludedByParent;

    let result = TreeEvalEnum.None;

    const pathDelimiter = this.pathDelimiter();
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

      if (!isMultiSelect || !this.#isFolder(x, pathDelimiter)) continue;

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

      if (this.#isFolder(x, pathDelimiter)) {
        // Works - Folder
        if (nodeType !== 'folder') continue;
        const res = nodeId === x;

        if (res) {
          result = dir;

          break;
        }
      }

      if (x.startsWith('*') && x.endsWith(`*${pathDelimiter}`)) {
        // Works - FolderNameIncludes
        if (nodeType !== 'folder') continue;
        const trimmedX = x.slice(1, -2);

        if (trimmedX === '') break;

        const res = nodeId?.includes(trimmedX + pathDelimiter);

        if (res) {
          result = dir;
          break;
        }
      }

      if (x.startsWith('[.*') && x.endsWith(`[^\\${pathDelimiter}]*]`)) {
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
    return currentPaths
      .filter((x) => !x.startsWith('-') && this.#isFolder(x, this.pathDelimiter()))
      .some((x) => x.startsWith(nodeId));
  }

  #globMatch(str: string, pattern: string, evaluateFullPath = false): boolean {
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.')
      .replace(/\[!([^\]]+)\]/g, '[^$1]');

    const regex = new RegExp(`${regexPattern}${evaluateFullPath ? '$' : ''}`);

    return regex.test(str);
  }

  showHiddenNodesEffect = effect(() => this._showHiddenNodes.set(this.showHiddenNodes()));

  pathDiscoveryMethodEffect = effect(() => {
    const discoveryMethod = this.pathDiscoveryMethod();
    const input = this.#inputRef();

    if (discoveryMethod === 'browse' && input) {
      this.currentPath.set(input.value);
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
                text: x.text,
                iconCls: x.iconCls,
                fileSize: x.fileSize,
                resolvedpath: x.resolvedpath,
                parentPath: this.getParentPath(x.id ?? ''),
              };
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
    const sep = this.pathDelimiter();
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
    const isFolder = this.#isFolder(node.id!, this.pathDelimiter());

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
      .filter((x) => x !== '' && x !== ROOTPATH && this.#isFolder(x, this.pathDelimiter()));

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
    return this.isByBackupSettings() ? this.#getBackupFiles(path) : this.#getFilesystemPath(path);
  }

  #fetchPathSegmentsRecursively(path: string) {
    const pathDelimiter = this.pathDelimiter();
    const deselectedPaths = path
      .split('\0')
      .filter((x) => x.startsWith('-'))
      .map((x) => x.slice(1, -1));

    let pathArr = path
      .split('\0')
      .filter((x) => !x.startsWith('-'))
      .filter(Boolean);

    const segmentArr = pathArr.map((x) => {
      const split = x.split(pathDelimiter);

      if (split.at(-1) !== '') {
        split.pop();
      }

      return split;
    });

    let urlPieces: string[] = [ROOTPATH];

    segmentArr.forEach((segments) => {
      segments.forEach((_, index) => {
        const urlCombined = segments.slice(0, index + 1).join(pathDelimiter);

        if (urlCombined === '') return;

        if (!urlPieces.includes(urlCombined)) {
          urlPieces.push(urlCombined);
        }
      });
    });

    this.isLoading.set(true);

    type ResultType<T> = {
      status: 'success' | 'error';
      value: T;
      url: string;
    };

    type FilePathResult = ResultType<GetApiV1BackupByIdFilesResponse | PostApiV1FilesystemResponse>;

    const observables: Observable<FilePathResult>[] = urlPieces.map((urlPiece) => {
      return (this.#getFilePath(urlPiece) as any).pipe(
        map((data) => ({ status: 'success', value: data, url: urlPiece }) as FilePathResult),
        catchError((err) => of({ status: 'error', value: err, url: urlPiece } as FilePathResult))
      );
    });

    forkJoin(observables)
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (res) => {
          const results = res.filter((x) => x.status === 'success') as FilePathResult[];
          const errors = res.filter((x) => x.status === 'error') as FilePathResult[];

          this.treeNodes.update((y) => {
            const allNewNodes = results.flatMap((x) => {
              return (x.value as any).map((z: any) => {
                const path = z.id;
                const resolvedPath = z.id.startsWith('%') && z.id.endsWith('%') ? z.resolvedpath + pathDelimiter : z.id;
                const parentPath = path && path.split(pathDelimiter).filter(Boolean).slice(0, -1).join(pathDelimiter);
                const _pathWithoutTrailingSlash = path && path.split(pathDelimiter).filter(Boolean).join(pathDelimiter);
                const pathWithoutTrailingSlash = pathDelimiter + _pathWithoutTrailingSlash;
                const found =
                  pathArr.findIndex((x) => {
                    return this.multiSelect() ? pathWithoutTrailingSlash.startsWith(x) : pathWithoutTrailingSlash === x;
                  }) > -1;

                const pathExistInArray = pathArr.findIndex((x) => x === path) > -1;
                const isDeselected = deselectedPaths.findIndex((x) => x === pathWithoutTrailingSlash) > -1;

                return {
                  ...z,
                  cls: this.#isFolder(resolvedPath, pathDelimiter) || resolvedPath == ROOTPATH ? 'folder' : 'file',
                  parentPath: parentPath.startsWith('%') ? parentPath : pathDelimiter + parentPath,
                  isSelected: (found && !isDeselected) || pathExistInArray,
                };
              });
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

  #isFolder(path: string, pathDelimiter: string): boolean {
    return (path.startsWith('%') && path.endsWith('%')) || path.endsWith(pathDelimiter);
  }

  #getPath(node: FileTreeNode | null = null, newPath = ROOTPATH) {
    const pathDelimiter = this.pathDelimiter();
    this.isLoading.set(true);

    (this.#getFilePath(newPath) as Observable<any>).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (x) => {
        let alignDataArray = this.isByBackupSettings()
          ? x.map((y: { Path: string; Size: number }) => {
              return {
                text: y.Path.split(pathDelimiter)
                  .filter((part) => part !== '')
                  .pop(),
                id: y.Path,
                cls: this.#isFolder(y.Path, pathDelimiter) ? 'folder' : 'file',
                leaf: node !== null,
                resolvedpath: y.Path,
                hidden: false,
              };
            })
          : x;

        this.treeNodes.update((y) => {
          const newArray = alignDataArray.map((z: any) => {
            const cls = this.#isFolder(z.id, pathDelimiter) ? 'folder' : 'file';

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
