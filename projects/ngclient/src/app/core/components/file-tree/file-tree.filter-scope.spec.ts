import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent, { TreeEvalEnum } from './file-tree.component';

// Regression tests for https://github.com/duplicati/ngclient/issues/580:
// filters must never highlight paths outside the selected sources.
describe('file tree filter highlighting is scoped to the selected sources', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });

  const listing: Record<string, { id: string; text: string; cls: string; leaf?: boolean }[]> = {
    '/': [
      { id: '/bin/', text: 'bin', cls: 'folder' },
      { id: '/boot/', text: 'boot', cls: 'folder' },
      { id: '/home/', text: 'home', cls: 'folder' },
    ],
    '/home/': [{ id: '/home/user/', text: 'user', cls: 'folder' }],
    '/home/user/': [
      { id: '/home/user/backup/', text: 'backup', cls: 'folder' },
      { id: '/home/user/docs/', text: 'docs', cls: 'folder' },
      { id: '/home/user/budget.txt', text: 'budget.txt', cls: 'file', leaf: true },
    ],
  };

  function setup(hasV2FilterOperations: boolean, testFilter?: ReturnType<typeof vi.fn>) {
    const list = vi.fn(({ body }: { body: { path: string } }) => of(listing[body.path] ?? []));
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV1Filesystem: list, postApiV2FilesystemTestFilter: testFilter ?? vi.fn() },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            filterGroups: signal({}),
            hasV2FilterOperations: () => hasV2FilterOperations,
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
    fixture.componentRef.setInput('showUnrootedSources', true);
    fixture.detectChanges();
    const tree = fixture.componentInstance;

    // Expand / -> /home/ -> /home/user/ so the nodes on both sides of the source are loaded
    for (const folder of ['/home/', '/home/user/']) {
      const node = findNode(tree, folder);
      tree.toggleNode(new Event('click'), folder, node);
    }
    return tree;
  }

  function findNode(tree: FileTreeComponent, id: string) {
    const stack = [...tree.treeStructure()];
    while (stack.length) {
      const node = stack.pop()!;
      if (node.id === id) return node;
      stack.push(...node.children);
    }
    throw new Error(`Node ${id} not found in tree`);
  }

  function evalStates(tree: FileTreeComponent, ids: string[]) {
    return Object.fromEntries(ids.map((id) => [id, findNode(tree, id).evalState]));
  }

  it('does not highlight folders outside the source for an include filter starting with */', () => {
    const tree = setup(false);
    tree.currentPath.set(['/home/user/', '+*/b*/'].join('\0'));
    fixture.detectChanges();

    expect(
      evalStates(tree, ['/bin/', '/boot/', '/home/', '/home/user/', '/home/user/backup/', '/home/user/docs/'])
    ).toEqual({
      '/bin/': TreeEvalEnum.None,
      '/boot/': TreeEvalEnum.None,
      '/home/': TreeEvalEnum.None,
      '/home/user/': TreeEvalEnum.Included,
      '/home/user/backup/': TreeEvalEnum.Included,
      '/home/user/docs/': TreeEvalEnum.Included,
    });
  });

  it('does not mark folders outside the source as excluded for an exclude filter starting with */', () => {
    const tree = setup(false);
    tree.currentPath.set(['/home/user/', '-*/b*/'].join('\0'));
    fixture.detectChanges();

    expect(evalStates(tree, ['/bin/', '/boot/', '/home/user/backup/', '/home/user/docs/'])).toEqual({
      '/bin/': TreeEvalEnum.None,
      '/boot/': TreeEvalEnum.None,
      '/home/user/backup/': TreeEvalEnum.Excluded,
      '/home/user/docs/': TreeEvalEnum.Included,
    });
  });

  it('does not highlight files outside the source for a wildcard file filter', () => {
    const tree = setup(false);
    tree.currentPath.set(['/home/user/docs/', '+*.txt'].join('\0'));
    fixture.detectChanges();

    expect(evalStates(tree, ['/home/user/budget.txt', '/home/user/docs/', '/bin/'])).toEqual({
      '/home/user/budget.txt': TreeEvalEnum.None,
      '/home/user/docs/': TreeEvalEnum.Included,
      '/bin/': TreeEvalEnum.None,
    });
  });

  it('ignores server filter results for paths outside the source', () => {
    // The server answers every tested path as included; only the paths within the source may use it
    const testFilter = vi.fn(({ body }: { body: { Paths: string[] } }) =>
      of({ Success: true, Data: body.Paths.map((Path) => ({ Path, Included: true, MatchedFilter: '*/b*/' })) })
    );
    vi.useFakeTimers();
    const tree = setup(true, testFilter);
    tree.currentPath.set(['/home/user/', '+*/b*/'].join('\0'));
    fixture.detectChanges();
    // The remote evaluation is debounced before the request is sent
    vi.advanceTimersByTime(500);
    fixture.detectChanges();

    expect(testFilter).toHaveBeenCalled();
    expect(testFilter.mock.lastCall?.[0].body).toEqual({
      Paths: expect.arrayContaining(['/bin/', '/home/user/backup/']),
      Sources: ['/home/user/'],
      Filters: ['+*/b*/'],
    });
    expect(evalStates(tree, ['/bin/', '/boot/', '/home/', '/home/user/', '/home/user/backup/'])).toEqual({
      '/bin/': TreeEvalEnum.None,
      '/boot/': TreeEvalEnum.None,
      '/home/': TreeEvalEnum.None,
      '/home/user/': TreeEvalEnum.Included,
      '/home/user/backup/': TreeEvalEnum.Included,
    });
  });
});
