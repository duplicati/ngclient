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
import { finalize, forkJoin, Observable } from 'rxjs';
import { DuplicatiServerService, GetApiV1BackupByIdFilesData, TreeNodeDto } from '../../openapi';
import { SysinfoState } from '../../states/sysinfo.state';

enum TreeEvalEnum {
  ExcludedByParent = -2,
  Excluded = -1,
  None = 0,
  Included = 1,
  IncludedByParent = 2,
}

type TreeNode = TreeNodeDto & {
  // isSelected: boolean;
  accepted?: boolean;
  parentPath: string;
};

type FileTreeNode = TreeNode & {
  children: FileTreeNode[];
  evalState: TreeEvalEnum;
  // isIncluded: boolean;
  // isExcluded: boolean;
  isIndeterminate: boolean;
};

type InputValueChangedEvent = CustomEvent<{ value: string }>;

interface CustomEventMap {
  inputValueChanged: InputValueChangedEvent;
}

declare global {
  interface HTMLInputElement {
    // Extend HTMLElement to cover input elements
    addEventListener<K extends keyof CustomEventMap>(
      type: K,
      listener: (this: HTMLElement, ev: CustomEventMap[K]) => any,
      options?: boolean | AddEventListenerOptions
    ): void;
  }
}

type BackupSettings = {
  id: string;
  time: string;
};

// TODO
// - Scroll to newly selected node by path
// - When rootPath get all the levels and batch them at the root level for better usability

@Component({
  selector: 'app-file-tree',
  imports: [
    SparkleButtonGroupComponent,
    SparkleToggleComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleListComponent,
    // SparkleCheckboxComponent,
    SparkleProgressBarComponent,
    NgTemplateOutlet,
    // JsonPipe,
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
  rootPath = input<string | undefined>(undefined);
  backupSettings = input<BackupSettings | null>(null);
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

  filterGroups = this.#sysInfo.filterGroups();
  isByBackupSettings = computed(() => this.rootPath() && this.backupSettings()?.id && this.backupSettings()?.time);
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
      .filter((x) => x !== '' && x !== '/');

    // Maybe just convert/replace filterGroup expressions with filterGroups content
    let currentPaths = structuredClone(_currentPaths);

    for (let index = 0; index < currentPaths.length; index++) {
      const path = currentPaths[index];
      const x = path.slice(1);

      if (x.startsWith('{') && x.endsWith('}')) {
        const groupName = x.slice(1, -1);

        const filterGroup = this.filterGroups?.['FilterGroups'][groupName];

        if (filterGroup && filterGroup.length) {
          // Insert the new array at the current path index replacing the old one
          const _filterGroup = filterGroup.map((x) => `-${x}`);
          currentPaths.splice(index, 1, ..._filterGroup);
        }
      }
    }

    const nodes = this.searchableTreeNodes();
    const nodeMap = new Map<string, FileTreeNode>();
    const rootPath = this.rootPath();
    const accepts = this.accepts();

    const root: FileTreeNode = rootPath
      ? {
          id: rootPath,
          resolvedpath: rootPath,
          text: rootPath?.replaceAll('/', ''),
          parentPath: '',
          children: [],
          evalState: TreeEvalEnum.None,
          isIndeterminate: false,
          cls: 'folder',
        }
      : {
          id: '/',
          resolvedpath: '/',
          text: 'Computer',
          parentPath: '',
          children: [],
          evalState: TreeEvalEnum.None,
          isIndeterminate: false,
        };

    if (accepts) {
      root.accepted = true;
    }

    nodeMap.set('/', root);

    for (const node of nodes) {
      const itemPath = (node.id as string).replace(rootPath ?? '', '');
      const pathParts = itemPath.split('/').filter(Boolean);

      let evaluatedPath = '';
      let parentNode = root;

      for (const part of pathParts) {
        evaluatedPath += '/' + part;

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
            resolvedpath: node.id?.startsWith('%') ? node.resolvedpath + '/' : evaluatedPath,
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

    return [root];
  });

  // TODO - on single select we might not wanna do all this compute for every selected node or not even for child nodes
  // NOTE - fileGroups are handled by exploding the fileGroup and injecting its paths into the currentPath
  #eval(currentPaths: string[], nodeId: string, nodeType: string, parentNode: FileTreeNode): TreeEvalEnum {
    if (parentNode.evalState === TreeEvalEnum.Excluded) return TreeEvalEnum.ExcludedByParent;

    let result = TreeEvalEnum.None;

    const pathsWithoutDir = currentPaths.filter((x) => !x.startsWith('-') && !x.startsWith('+'));
    const pathsWithDir = currentPaths.filter((x) => x.startsWith('-') || x.startsWith('+'));

    if (pathsWithoutDir.length === 0) return result;

    // Find first excluded or included node per pathWithoutDir
    for (let index = 0; index < pathsWithoutDir.length; index++) {
      const x = pathsWithoutDir[index];

      const res = nodeId?.startsWith(x);

      if (res) {
        result = TreeEvalEnum.Included;
        break;
      }
    }

    if (pathsWithDir.length === 0) return result;

    // Then find first excluded or included node per pathWithDir
    for (let i = 0; i < pathsWithDir.length; i++) {
      const pathPart = pathsWithDir[i];
      const x = pathPart.slice(1);
      const dir = pathPart.startsWith('-') ? 'exclude' : 'include';

      if (x.startsWith('/') && x.endsWith('/')) {
        // Works - Folder
        if (nodeType !== 'folder') continue;
        const res = nodeId === x;

        if (res) {
          result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;

          break;
        }
      }

      if (x.startsWith('*') && x.endsWith('*/')) {
        // Works - FolderNameIncludes
        if (nodeType !== 'folder') continue;
        const trimmedX = x.slice(1, -2);

        if (trimmedX === '') break;

        const res = nodeId?.includes(trimmedX + '/');

        if (res) {
          result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
          break;
        }
      }

      if (x.startsWith('[.*') && x.endsWith('[^\\/]*]')) {
        // Works - FileNameIncludes
        if (nodeType !== 'file') continue;

        const regexPattern = x.slice(3, -7);
        const regex = new RegExp(regexPattern);
        const res = regex.test(nodeId!);

        if (res) {
          result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
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
          result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
          break;
        }
      }

      if (x.startsWith('*.')) {
        // Works - File Extension globbing
        if (nodeType !== 'file') continue;
        if (x.replace('*.', '').length === 0) continue;

        const res = this.#globMatch(nodeId!, x, true);

        if (res) {
          result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
          break;
        }
      }

      // Works - Expression
      if (x === '') continue;

      const res = this.#globMatch(nodeId!, x, true);

      if (res) {
        result = dir === 'include' ? TreeEvalEnum.Included : TreeEvalEnum.Excluded;
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
    return currentPaths.some((x) => x.startsWith(nodeId));
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
    if (node.cls === 'folder' || node.id === '/') return true;

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
      console.log(startingPath);

      this.currentPath.set(startingPath);
      this.#fetchPathSegmentsRecursively(startingPath);
    } else {
      this.#getPath(null, this.rootPath());
    }
  }

  toggleSelectedNode($event: Event, node: FileTreeNode) {
    if (node.id === '/') return;

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
      .filter((x) => x !== '' && x !== '/');

    const pathToTest = this.isChildOfSelected(node) ? `-${node.id}` : node.id!;

    if (this.multiSelect()) {
      if (currentPaths.includes(node.id!)) {
        // is selected
        this.currentPath.set(currentPaths.filter((x) => x !== node.id).join('\0'));
      } else if (currentPaths.some((x) => x.startsWith(pathToTest))) {
        // is child of selected
        this.currentPath.set(currentPaths.filter((x) => x !== pathToTest).join('\0'));
      } else {
        // is not selected
        this.currentPath.set([...currentPaths, pathToTest].join('\0'));
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
      .filter((x) => x !== '' && x !== '/');

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
    const params: GetApiV1BackupByIdFilesData = {
      id: backupSettings.id,
      time: backupSettings.time,
      prefixOnly: false,
      folderContents: true,
    };

    if (path) {
      params.filter = '@' + path;
    }

    return this.#dupServer.getApiV1BackupByIdFiles(params);
  }

  #getFilePath(path: string) {
    return this.isByBackupSettings() ? this.#getBackupFiles(path) : this.#getFilesystemPath(path);
  }

  #fetchPathSegmentsRecursively(path: string) {
    const deselectedPaths = path
      .split('\0')
      .filter((x) => x.startsWith('-'))
      .map((x) => x.slice(1, -1));

    const pathArr = path
      .split('\0')
      .filter((x) => !x.startsWith('-'))
      .filter(Boolean);

    const segmentArr = pathArr.map((x) => x.split('/').filter(Boolean));

    let urlPieces: string[] = [this.rootPath() ?? '/'];

    segmentArr.forEach((segments) => {
      segments.forEach((_, index) => {
        const urlCombined = segments.slice(0, index + 1).join('/');
        const urlPiece = urlCombined.startsWith('%') ? urlCombined : '/' + urlCombined;

        if (!urlPieces.includes(urlPiece)) {
          urlPieces.push(urlPiece);
        }
      });
    });

    this.isLoading.set(true);

    forkJoin([...urlPieces.map((urlPiece) => this.#getFilePath(urlPiece === '/' ? urlPiece : urlPiece))])
      .pipe(finalize(() => this.isLoading.set(false)))
      .subscribe({
        next: (results) => {
          this.treeNodes.update((y) => {
            const allNewNodes = results.flatMap((x) => {
              return (x as any).map((z: any) => {
                const path = z.id;
                const parentPath = path && path.split('/').filter(Boolean).slice(0, -1).join('/');
                const _pathWithoutTrailingSlash = path && path.split('/').filter(Boolean).join('/');
                const pathWithoutTrailingSlash = '/' + _pathWithoutTrailingSlash;
                const found =
                  pathArr.findIndex((x) => {
                    return this.multiSelect() ? pathWithoutTrailingSlash.startsWith(x) : pathWithoutTrailingSlash === x;
                  }) > -1;

                const hi = pathArr.findIndex((x) => x === path) > -1;
                const isDeselected = deselectedPaths.findIndex((x) => x === pathWithoutTrailingSlash) > -1;

                return {
                  ...z,
                  parentPath: parentPath.startsWith('%') ? parentPath : '/' + parentPath,
                  isSelected: (found && !isDeselected) || hi, // TODO - Use deselected paths to disable
                };
              });
            });

            const arrayUniqueByKey = [
              ...new Map([...y, ...allNewNodes].map((item) => [item.resolvedpath ?? item.id, item])).values(),
            ];

            this.#findActiveNodeAndScrollTo();

            return arrayUniqueByKey as TreeNode[];
          });
        },
      });
  }

  #getPath(node: FileTreeNode | null = null, newPath = '/') {
    this.isLoading.set(true);

    (this.#getFilePath(newPath) as Observable<any>).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (x) => {
        let alignDataArray = this.isByBackupSettings()
          ? x['Files'].map((y: { Path: string; Size: any }) => {
              return {
                text: y.Path.split('/')
                  .filter((part) => part !== '')
                  .pop(),
                id: y.Path,
                cls: y.Path.endsWith('/') ? 'folder' : 'file',
                leaf: node !== null,
                resolvedpath: y.Path,
                hidden: false,
              };
            })
          : x;

        this.treeNodes.update((y) => {
          const newArray = alignDataArray.map((z: any) => {
            const cls = (z.id.startsWith('%') && z.id.endsWith('%')) || z.id.endsWith('/') ? 'folder' : 'file';

            return {
              ...z,
              cls,
              parentPath: newPath,
              // isSelected: (this.multiSelect() && node?.isSelected) ?? false,
            };
          });

          const arrayUniqueByKey = [
            ...new Map([...y, ...newArray].map((item) => [item.resolvedpath ?? item.id, item])).values(),
          ];

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
