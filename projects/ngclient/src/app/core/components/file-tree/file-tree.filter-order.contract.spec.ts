import { FILE_TREE_FILTER_CASES } from './testing/file-tree-filter-cases';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent, { TreeEvalEnum } from './file-tree.component';

type Node = ReturnType<FileTreeComponent['treeNodes']>[number];
const node = (id: string, parentPath: string, cls: string, resolvedpath = id): Node => ({
  id,
  parentPath,
  cls,
  resolvedpath,
  text: id,
  iconCls: null,
  check: false,
  leaf: cls === 'file',
  hidden: false,
  systemFile: false,
  temporary: false,
  symlink: false,
  fileSize: 0,
});
const cases = FILE_TREE_FILTER_CASES;

describe('file tree ordered filter contracts', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  it.each(cases)('$name', ({ source, path, resolved, kind, filters, expected }) => {
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1Filesystem: () => of([]) } },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            filterGroups: signal({}),
            hasV2FilterOperations: () => false,
            resolveShorthandPath: (path: string) => path,
          },
        },
        { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
        { provide: ShipDialogService, useValue: {} },
      ],
    });
    TestBed.overrideComponent(FileTreeComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(FileTreeComponent);
    fixture.componentRef.setInput('multiSelect', true);
    fixture.componentRef.setInput('showFiles', true);
    fixture.componentRef.setInput('resolvePaths', true);
    fixture.detectChanges();
    const tree = fixture.componentInstance;
    tree.treeNodes.set([node(source, '/', 'folder'), node(path, source, kind, resolved)]);
    tree.currentPath.set([source, ...filters].join('\0'));
    const target = tree
      .treeStructure()[0]
      .children.find((n) => n.id === source)!
      .children.find((n) => n.id === path)!;
    expect(target.evalState).toBe(TreeEvalEnum[expected]);
  });
});
