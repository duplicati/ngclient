import { JsonPipe, NgTemplateOutlet } from '@angular/common';
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
  SparkleCheckboxComponent,
  SparkleFormFieldComponent,
  SparkleIconComponent,
  SparkleListComponent,
  SparkleProgressBarComponent,
  SparkleToggleComponent,
} from '@sparkle-ui/core';
import { finalize, forkJoin, Observable } from 'rxjs';
import { DuplicatiServerService, GetApiV1BackupByIdFilesData, TreeNodeDto } from '../../openapi';

type TreeNode = TreeNodeDto & {
  isSelected: boolean;
  accepted?: boolean;
  parentPath: string;
};

type FileTreeNode = TreeNode & {
  children: FileTreeNode[];
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
  standalone: true,
  imports: [
    SparkleButtonGroupComponent,
    SparkleToggleComponent,
    SparkleIconComponent,
    SparkleFormFieldComponent,
    SparkleListComponent,
    SparkleCheckboxComponent,
    SparkleProgressBarComponent,
    NgTemplateOutlet,
    JsonPipe,
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

  multiSelect = input(false);
  disabled = input(false);
  showFiles = input(false);
  selectFiles = input(false);
  accepts = input<string | null | undefined>(null);
  startingPath = input<string | null>(null);
  rootPath = input<string | undefined>(undefined);
  backupSettings = input<BackupSettings | null>(null);
  showHiddenNodes = input(false);
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

  isByBackupSettings = computed(() => this.rootPath() && this.backupSettings()?.id && this.backupSettings()?.time);
  searchableTreeNodes = computed<TreeNode[]>(() => {
    const query = this.treeSearchQuery();
    return query
      ? this.treeNodes().filter((x) => x.text?.toLowerCase().includes(query.toLowerCase()))
      : this.treeNodes();
  });

  treeStructure = computed<FileTreeNode[]>(() => {
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
          isSelected: false,
          cls: 'folder',
        }
      : {
          id: '/',
          resolvedpath: '/',
          text: 'Computer',
          parentPath: '',
          children: [],
          isSelected: false,
        };

    if (accepts) {
      root.accepted = true;
    }

    nodeMap.set('/', root);

    for (const node of nodes) {
      const itemPath = (node.id as string).replace(rootPath ?? '', '');
      const pathParts = itemPath.split('/').filter(Boolean);

      let currentPath = '';
      let parentNode = root;

      for (const part of pathParts) {
        currentPath += '/' + part;

        if (!nodeMap.has(currentPath)) {
          const newNode: FileTreeNode = {
            id: node.id,
            isSelected: node.isSelected,
            parentPath: currentPath,
            resolvedpath: node.id?.startsWith('%') ? node.resolvedpath + '/' : currentPath,
            hidden: node.hidden,
            text: node.text,
            cls: node.cls,
            children: [],
          };

          if (accepts) {
            newNode.accepted = this.matchAccepts(accepts, newNode);
          }

          nodeMap.set(currentPath, newNode);
          parentNode.children.push(newNode);
        }

        parentNode = nodeMap.get(currentPath)!;
      }
    }

    return [root];
  });

  showHiddenNodesEffect = effect(() => this._showHiddenNodes.set(this.showHiddenNodes()), {
    allowSignalWrites: true,
  });

  pathDiscoveryMethodEffect = effect(
    () => {
      const disvoeryMethod = this.pathDiscoveryMethod();
      const input = this.#inputRef();

      if (disvoeryMethod === 'browse' && input) {
        if (this.multiSelect()) {
          const arr = input.value.split('\0');
          this.treeNodes.update((y) =>
            y.map((z) => ({ ...z, isSelected: typeof z.id === 'string' && arr.includes(z.id) }))
          );
        } else {
          this.treeNodes.update((y) => y.map((z) => ({ ...z, isSelected: z.id === input.value })));
        }
      }
    },
    {
      allowSignalWrites: true,
    }
  );

  matchAccepts(accepts: string, node: FileTreeNode) {
    if (!accepts) return true;
    if (node.cls === 'folder' || node.id === '/') return true;

    const extensions = accepts.split(',');

    if (extensions.length === 0) return true;

    const fileExt = '.' + node.id!.slice(node.id!.indexOf('.'));

    if (!fileExt) return false;

    return extensions.some((x) => fileExt.endsWith(x));
  }

  #scrollToFirstSelectedNode() {
    const selectedNodes = this.treeContainerRef()?.nativeElement.querySelectorAll('.active');

    if (selectedNodes && selectedNodes.length > 0) {
      selectedNodes[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  currentPathEffect = effect(
    () => {
      const input = this.#inputRef();

      if (input) {
        input.value = this.currentPath();
        input.dispatchEvent(new Event('input'));
      }
    },
    {
      allowSignalWrites: true,
    }
  );

  selectedPathsEffect = effect(
    () => {
      if (this.multiSelect()) {
        const selectedNodes = this.treeNodes().filter((node) => node.isSelected);
        const excludedNodes = this.treeNodes().filter(
          (node) => !node.isSelected && selectedNodes.some((selected) => node.id?.startsWith(selected.id as string))
        );

        const selectedMapped = selectedNodes
          .filter(
            (node) =>
              !selectedNodes.some(
                (otherNode) => node.id !== otherNode.id && node.id?.startsWith(otherNode.id as string)
              )
          )
          .map((node) => node.id as string);

        const excludedMapped = excludedNodes
          .filter(
            (node) =>
              !excludedNodes.some(
                (otherNode) => node.id !== otherNode.id && node.id?.startsWith(otherNode.id as string)
              )
          )
          .map((node) => `-${node.id as string}`);

        this.excludes.emit(excludedMapped);

        const newPath = [...selectedMapped, ...excludedMapped] as string[];

        this.currentPath.set(newPath.join('\0'));
      } else {
        const selectedNode = this.treeNodes().find((node) => node.isSelected);

        const resolvedPath = selectedNode?.resolvedpath as string;

        this.currentPath.set(selectedNode?.id ?? '');
      }
    },
    {
      allowSignalWrites: true,
    }
  );

  inputValueChangeAbortController: AbortController | null = null;
  inputRefEffect = effect(
    () => {
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
    },
    { allowSignalWrites: true }
  );

  ngOnInit() {
    const startingPath = this.startingPath();

    if (startingPath) {
      this.currentPath.set(startingPath);
      this.#fetchPathSegmentsRecursively(startingPath);
    } else {
      this.#getPath(null, this.rootPath());
    }
  }

  toggleSelectedNode($event: Event, node: FileTreeNode) {
    if (node.id === '/') return;

    $event.stopPropagation();

    if (this.selectFiles() && node.cls === 'folder') {
      this.toggleNode(node.id as string, node);
      return;
    }

    const accepts = this.accepts();

    if (accepts && !node.accepted) return;

    if (this.multiSelect()) {
      this.treeNodes.update((y) =>
        y.map((z) => {
          if (z.id?.startsWith(node.id as string)) {
            return { ...z, isSelected: !node.isSelected };
          }
          return z;
        })
      );
    } else {
      this.treeNodes.update((y) =>
        y.map((z) => {
          if (z.id === (node.id as string)) {
            return { ...z, isSelected: !node.isSelected };
          } else {
            return { ...z, isSelected: false };
          }
        })
      );
    }
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

            return arrayUniqueByKey as TreeNode[];
          });
        },
      });
  }

  #getPath(node: FileTreeNode | null = null, newPath = '/') {
    this.isLoading.set(true);

    (this.#getFilePath(newPath) as Observable<any>).pipe(finalize(() => this.isLoading.set(false))).subscribe({
      next: (x) => {
        const alignDataArray = this.isByBackupSettings()
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
              isSelected: (this.multiSelect() && node?.isSelected) ?? false,
            };
          });

          const arrayUniqueByKey = [
            ...new Map([...y, ...newArray].map((item) => [item.resolvedpath ?? item.id, item])).values(),
          ];

          return arrayUniqueByKey as TreeNode[];
        });
      },
    });
  }
}
