import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent, { TreeEvalEnum } from './file-tree.component';

// A source folder with an include pick: only the picked entries are backed up, the rest is
// excluded by a catch-all, and clicks inside the folder add or remove picks instead of excludes.
describe('file tree with an include pick', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  const listing: Record<string, { id: string; text: string; cls: string; leaf?: boolean; resolvedpath?: string }[]> = {
    '/': [
      { id: '%HOME%', text: 'Home', cls: 'folder', resolvedpath: '/home/user' },
      { id: '/home/', text: 'home', cls: 'folder' },
    ],
    '/home/': [{ id: '/home/user/', text: 'user', cls: 'folder' }],
    '/home/user/': [
      { id: '/home/user/backup/', text: 'backup', cls: 'folder' },
      { id: '/home/user/docs/', text: 'docs', cls: 'folder' },
      { id: '/home/user/budget.txt', text: 'budget.txt', cls: 'file', leaf: true },
    ],
    '/home/user/docs/': [
      { id: '/home/user/docs/cache/', text: 'cache', cls: 'folder' },
      { id: '/home/user/docs/todo.md', text: 'todo.md', cls: 'file', leaf: true },
    ],
  };

  const folder = '/home/user/';
  const picked = [folder, '+/home/user/docs/*', '-/home/user/*'];

  function setup(enableIncludePicker = true) {
    const list = vi.fn(({ body }: { body: { path: string } }) => of(listing[body.path] ?? []));
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        {
          provide: DuplicatiServer,
          useValue: { postApiV1Filesystem: list, postApiV2FilesystemTestFilter: vi.fn() },
        },
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
    fixture.componentRef.setInput('enableIncludePicker', enableIncludePicker);
    fixture.detectChanges();
    const tree = fixture.componentInstance;

    for (const path of ['/home/', '/home/user/', '/home/user/docs/']) {
      tree.toggleNode(new Event('click'), path, findNode(tree, path));
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

  function click(tree: FileTreeComponent, id: string) {
    tree.toggleSelectedNode(new Event('click'), findNode(tree, id));
    fixture.detectChanges();
  }

  it('shows the picked entries as included and the rest of the folder as excluded', () => {
    const tree = setup();
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    expect(
      evalStates(tree, [
        '/home/',
        folder,
        '/home/user/backup/',
        '/home/user/docs/',
        '/home/user/docs/todo.md',
        '/home/user/budget.txt',
      ])
    ).toEqual({
      '/home/': TreeEvalEnum.None,
      [folder]: TreeEvalEnum.Included,
      '/home/user/backup/': TreeEvalEnum.Excluded,
      '/home/user/docs/': TreeEvalEnum.Included,
      '/home/user/docs/todo.md': TreeEvalEnum.Included,
      '/home/user/budget.txt': TreeEvalEnum.Excluded,
    });
    expect(tree.pickedFolders()).toEqual(new Set([folder]));
    expect(tree.isPickedFolder(findNode(tree, folder))).toBe(true);
    expect(tree.isPickedFolder(findNode(tree, '/home/user/docs/'))).toBe(false);
  });

  it('never marks a source itself as excluded, whatever the filters say', () => {
    const tree = setup(false);
    tree.currentPath.set([folder, '-/home/user/*'].join('\0'));
    fixture.detectChanges();

    expect(evalStates(tree, [folder, '/home/user/docs/'])).toEqual({
      [folder]: TreeEvalEnum.Included,
      '/home/user/docs/': TreeEvalEnum.Excluded,
    });
  });

  it('picks an excluded entry on click and places it before the catch-all', () => {
    const tree = setup();
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    click(tree, '/home/user/budget.txt');

    expect(tree.currentPathArray()).toEqual([folder, '+/home/user/docs/*', '+/home/user/budget.txt', '-/home/user/*']);
    expect(findNode(tree, '/home/user/budget.txt').evalState).toBe(TreeEvalEnum.Included);
  });

  it('unpicks a picked entry on click', () => {
    const tree = setup();
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    click(tree, '/home/user/docs/');

    expect(tree.currentPathArray()).toEqual([folder, '-/home/user/*']);
    expect(findNode(tree, '/home/user/docs/').evalState).toBe(TreeEvalEnum.Excluded);
  });

  it('excludes an entry inside a picked folder ahead of the includes, and includes it again on the next click', () => {
    const tree = setup();
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    click(tree, '/home/user/docs/cache/');
    expect(tree.currentPathArray()).toEqual([folder, '-/home/user/docs/cache/', '+/home/user/docs/*', '-/home/user/*']);
    expect(findNode(tree, '/home/user/docs/cache/').evalState).toBe(TreeEvalEnum.Excluded);
    expect(findNode(tree, '/home/user/docs/todo.md').evalState).toBe(TreeEvalEnum.Included);

    click(tree, '/home/user/docs/cache/');
    expect(tree.currentPathArray()).toEqual(picked);
  });

  it('keeps the plain exclude behavior when the picker is not enabled', () => {
    const tree = setup(false);
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    click(tree, '/home/user/budget.txt');

    expect(tree.currentPathArray()).toEqual([...picked, '-/home/user/budget.txt']);
  });

  it('offers the picker on local folders only', () => {
    const tree = setup();
    tree.currentPath.set(picked.join('\0'));
    fixture.detectChanges();

    const emitted: string[] = [];
    tree.includePick.subscribe((path) => emitted.push(path));

    expect(tree.offersIncludePicker(findNode(tree, '/home/user/docs/'))).toBe(true);
    expect(tree.offersIncludePicker(findNode(tree, '/home/user/budget.txt'))).toBe(false);
    expect(tree.offersIncludePicker(findNode(tree, '/'))).toBe(false);

    const event = new Event('click');
    tree.requestIncludePick(event, findNode(tree, '/home/user/docs/'));
    expect(emitted).toEqual(['/home/user/docs/']);
  });

  it('offers the picker on shortcuts and keeps the token as the pick folder', () => {
    const tree = setup();
    tree.currentPath.set(['%HOME%', '+%HOME%/docs/*', '-%HOME%/*'].join('\0'));
    fixture.detectChanges();

    const emitted: string[] = [];
    tree.includePick.subscribe((path) => emitted.push(path));
    const home = findNode(tree, '%HOME%');

    expect(tree.offersIncludePicker(home)).toBe(true);
    expect(tree.includePickFolder(home)).toBe('%HOME%');
    expect(tree.isPickedFolder(home)).toBe(true);

    tree.requestIncludePick(new Event('click'), home);
    expect(emitted).toEqual(['%HOME%']);
  });

  it('stores a pick on a remote source under its mount folder', () => {
    const tree = setup();
    const remoteSource = {
      mount: '/dupl-office365-abc',
      prefix: '@/dupl-office365-abc',
      url: 'office365://tenant',
      type: 'office365',
      path: '',
    };
    const root = { id: '/dupl-office365-abc', cls: 'folder', children: [], remoteSource } as any;
    const child = {
      id: '/dupl-office365-abc/Users/kenneth/',
      cls: 'folder',
      children: [],
      remoteSource: { ...remoteSource, path: '/Users/kenneth/' },
    } as any;

    expect(tree.offersIncludePicker(root)).toBe(true);
    expect(tree.includePickFolder(root)).toBe('/dupl-office365-abc/');
    expect(tree.includePickFolder(child)).toBe('/dupl-office365-abc/Users/kenneth/');
  });
});
