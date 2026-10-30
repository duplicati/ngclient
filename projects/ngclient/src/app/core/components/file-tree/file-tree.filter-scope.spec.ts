import { DecimalPipe } from '@angular/common';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent, { TreeEvalEnum } from './file-tree.component';

type Node = ReturnType<FileTreeComponent['treeNodes']>[number];
const node = (id: string, parentPath = '/', cls = 'folder'): Node => ({
  id,
  text: id,
  cls,
  parentPath,
  iconCls: null,
  check: false,
  leaf: cls === 'file',
  resolvedpath: id,
  hidden: false,
  systemFile: false,
  temporary: false,
  symlink: false,
  fileSize: 0,
});

describe('file tree filters stay within source selection', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
    vi.useRealTimers();
  });
  function setup(remote = false, fails = false) {
    const evaluate = vi.fn(() => (fails ? throwError(() => new Error('offline')) : of({ Success: true, Data: [] })));
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        DecimalPipe,
        {
          provide: DuplicatiServer,
          useValue: { postApiV1Filesystem: () => of([]), postApiV2FilesystemTestFilter: evaluate },
        },
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            filterGroups: signal({}),
            hasV2FilterOperations: () => remote,
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
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component.treeNodes.set([
      node('/selected/'),
      node('/selected/b-one/', '/selected/'),
      node('/selected/a.txt', '/selected/', 'file'),
      node('/outside/'),
      node('/outside/b-two/', '/outside/'),
      node('/outside/a.txt', '/outside/', 'file'),
      node('/selected-extra/'),
      node('/selected-extra/b-three/', '/selected-extra/'),
    ]);
    return { component, evaluate };
  }
  function states(component: FileTreeComponent) {
    const result = new Map<string, TreeEvalEnum>();
    const visit = (nodes: ReturnType<FileTreeComponent['treeStructure']>) =>
      nodes.forEach((n) => {
        result.set(n.id!, n.evalState);
        visit(n.children);
      });
    visit(component.treeStructure());
    return result;
  }
  it.each(['+*/b*', '-*/b*', '+/outside/b-two/', '+[.*/b[^/]+/]'])(
    'does not apply %s outside selected sources',
    (filter) => {
      const { component } = setup();
      component.currentPath.set('/selected/\0' + filter);
      expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.None);
      expect(states(component).get('/selected-extra/b-three/')).toBe(TreeEvalEnum.None);
    }
  );
  it('keeps selected descendants included and applies exclusion filters inside that source', () => {
    const { component } = setup();
    component.currentPath.set('/selected/\0-*/b*');
    expect(states(component).get('/selected/b-one/')).toBe(TreeEvalEnum.Excluded);
    expect(states(component).get('/selected/a.txt')).toBe(TreeEvalEnum.Included);
  });
  it('does not extend an individual file source to other matching files', () => {
    const { component } = setup();
    component.currentPath.set('/selected/a.txt\0+*.txt');
    expect(states(component).get('/selected/a.txt')).toBe(TreeEvalEnum.Included);
    expect(states(component).get('/outside/a.txt')).toBe(TreeEvalEnum.None);
  });
  it('evaluates each of multiple source selections', () => {
    const { component } = setup();
    component.currentPath.set('/selected/\0/outside/\0-*/b*');
    expect(states(component).get('/selected/b-one/')).toBe(TreeEvalEnum.Excluded);
    expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.Excluded);
    expect(states(component).get('/selected-extra/b-three/')).toBe(TreeEvalEnum.None);
  });
  it('does not use filters alone as source selections', () => {
    const { component } = setup();
    component.currentPath.set('+*/b*');
    expect(states(component).get('/selected/b-one/')).toBe(TreeEvalEnum.None);
  });
  it.each([
    ['C:\\selected\\', 'C:\\selected\\b-one\\', 'C:\\outside\\', 'C:\\outside\\b-two\\'],
    [
      '\\\\server\\selected\\',
      '\\\\server\\selected\\b-one\\',
      '\\\\server\\outside\\',
      '\\\\server\\outside\\b-two\\',
    ],
  ])('keeps Windows and UNC filters scoped to %s', (source, inside, outsideRoot, outside) => {
    const { component } = setup();
    component.treeNodes.set([node(source), node(inside, source), node(outsideRoot), node(outside, outsideRoot)]);
    component.currentPath.set(source + '\0+*\\b*');
    expect(states(component).get(inside)).toBe(TreeEvalEnum.Included);
    expect(states(component).get(outside)).toBe(TreeEvalEnum.None);
  });
  it.each([false, true])('keeps fallback evaluation scoped when the server response fails: %s', async (fails) => {
    vi.useFakeTimers();
    const { component, evaluate } = setup(true, fails);
    component.currentPath.set('/selected/\0+*/b*');
    fixture.detectChanges();
    expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.None);
    await vi.advanceTimersByTimeAsync(350);
    fixture.detectChanges();
    expect(evaluate).toHaveBeenCalled();
    expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.None);
    expect(states(component).get('/selected/b-one/')).toBe(TreeEvalEnum.Included);
  });

  it('keeps resolved node paths inside their selected source', () => {
    const { component } = setup();
    fixture.componentRef.setInput('resolvePaths', true);
    component.treeNodes.set([
      { ...node('/shortcut/'), resolvedpath: '/selected/' },
      { ...node('/shortcut/b-one/', '/shortcut/'), resolvedpath: '/selected/b-one/' },
      node('/outside/'),
      node('/outside/b-two/', '/outside/'),
    ]);
    component.currentPath.set('/selected/\0+*/b*');
    expect(states(component).get('/shortcut/b-one/')).toBe(TreeEvalEnum.Included);
    expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.None);
  });
  it('retains shortcut-folder selection while restricting its filters', () => {
    const { component } = setup();
    component.treeNodes.set([
      node('%HOME%'),
      node('%HOME%/b-one/', '%HOME%'),
      node('/outside/'),
      node('/outside/b-two/', '/outside/'),
    ]);
    component.currentPath.set('%HOME%\0+*/b*');
    expect(states(component).get('%HOME%/b-one/')).toBe(TreeEvalEnum.Included);
    expect(states(component).get('/outside/b-two/')).toBe(TreeEvalEnum.None);
  });
  it('retains remote-mount selection while restricting its filters', () => {
    const { component } = setup();
    component.treeNodes.set([
      node('cloud/'),
      node('cloud/b-one/', 'cloud/'),
      node('other/'),
      node('other/b-two/', 'other/'),
    ]);
    component.currentPath.set('@cloud|s3://bucket|/\0+*/b*');
    expect(states(component).get('cloud/b-one/')).toBe(TreeEvalEnum.Included);
    expect(states(component).get('other/b-two/')).toBe(TreeEvalEnum.None);
  });
});
