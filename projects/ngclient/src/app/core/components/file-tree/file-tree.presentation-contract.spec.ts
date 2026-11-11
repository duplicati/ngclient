import { DecimalPipe } from '@angular/common';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it } from 'vitest';
import { DuplicatiServer, SearchEntriesItemDto } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent, { TreeEvalEnum } from './file-tree.component';

const entry = (Path: string, Metadata: SearchEntriesItemDto['Metadata'] = null, Size = 12): SearchEntriesItemDto => ({
  Path,
  Metadata,
  Size,
  Version: 0,
  Time: '2026-10-30T00:00:00Z',
  IsDirectory: Path.endsWith('/') || Path.endsWith('\\'),
  IsSymlink: false,
  LastModified: '2026-10-30T00:00:00Z',
});
type Node = ReturnType<FileTreeComponent['treeNodes']>[number];
const node = (id: string, text: string, cls = 'file', parentPath = '/'): Node => ({
  id,
  text,
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
  fileSize: 12,
});

describe('file tree presentation contracts', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  function setup(results: SearchEntriesItemDto[] = [], inputs: Record<string, unknown> = {}, render = false) {
    const sorting = { foldersFirst: signal(true), caseSensitiveSort: signal(false) };
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        DecimalPipe,
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
        { provide: FileTreeState, useValue: sorting },
        { provide: ShipDialogService, useValue: {} },
      ],
    });
    if (!render) TestBed.overrideComponent(FileTreeComponent, { set: { template: '', imports: [] } });
    fixture = TestBed.createComponent(FileTreeComponent);
    fixture.componentRef.setInput('searchMode', true);
    fixture.componentRef.setInput('multiSelect', true);
    fixture.componentRef.setInput('searchResults', results);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return { component: fixture.componentInstance, sorting };
  }
  it('returns no generated root for empty search results', () => {
    expect(setup().component.searchResultTreeStructure()).toEqual([]);
  });
  it('collapses a single-child folder chain without changing the file path', () => {
    const { component } = setup([entry('/home/user/docs/report.txt')]);
    const [folder] = component.searchResultTreeStructure();
    expect(folder).toMatchObject({ id: '/home/', text: 'home/user/docs', isGenerated: true, isSearchMatch: false });
    expect(folder.children).toHaveLength(1);
    expect(folder.children[0]).toMatchObject({
      id: '/home/user/docs/report.txt',
      parentPath: '/home/',
      text: 'report.txt',
      cls: 'file',
      fileSize: 12,
      lastModified: '2026-10-30T00:00:00Z',
      isSearchMatch: true,
    });
  });
  it.each([
    ['C:\\Users\\Jam\\report.txt', 'C:\\', 'C:\\Users\\Jam'],
    ['\\\\server\\share\\docs\\report.txt', '\\\\server\\', 'server\\share\\docs'],
  ])('preserves drive and UNC separators for %s', (path, id, text) => {
    const [folder] = setup([entry(path)]).component.searchResultTreeStructure();
    expect(folder.id).toBe(id);
    expect(folder.text).toBe(text);
    expect(folder.children[0].id).toBe(path);
  });
  it('retains branching folders and generated-versus-matched flags', () => {
    const { component } = setup([entry('/root/a/one.txt'), entry('/root/b/two.txt'), entry('/root/a/')]);
    const [root] = component.searchResultTreeStructure();
    expect(root.text).toBe('root');
    expect(root.children.map((n) => n.id)).toEqual(['/root/a/', '/root/b/']);
    expect(root.children[0]).toMatchObject({ isGenerated: false, isSearchMatch: true, hasChildrenInSearch: true });
    expect(root.children[1]).toMatchObject({ isGenerated: true, isSearchMatch: false });
  });
  it('uses the last duplicate result metadata and size without duplicating nodes', () => {
    const [root] = setup([
      entry('/root/a.txt', null, 1),
      entry('/root/a.txt', { 'o365:Name': 'Latest' }, 42),
    ]).component.searchResultTreeStructure();
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ text: 'Latest', fileSize: 42 });
  });
  it('uses parent metadata over browsed names, and matching metadata over both', () => {
    const { component } = setup([entry('/account/docs/a.txt', { 'gsuite:Name': 'Report' })], {
      rootPaths: ['/account/'],
      rootMetadata: { '/account/': { 'gsuite:Name': 'Account' } },
      searchParentMetadata: { '/account/docs/': { 'gsuite:Name': 'Documents' } },
    });
    component.treeNodes.set([node('/account/docs/', 'Old name', 'folder', '/account/')]);
    const [folder] = component.searchResultTreeStructure();
    expect(folder.text).toBe('Account/Documents');
    expect(folder.children[0].text).toBe('Report');
  });
  it('tracks selections, exclusions and indeterminate folders after input changes', () => {
    const { component } = setup([entry('/root/a.txt'), entry('/root/b.txt')]);
    component.currentPath.set('/root/a.txt');
    expect(component.searchResultTreeStructure()[0].isIndeterminate).toBe(true);
    component.currentPath.set('/root/sub/');
    expect(component.searchResultTreeStructure()[0].isIndeterminate).toBe(true);
    component.currentPath.set('/root/a.txt');
    expect(component.searchResultTreeStructure()[0].children[0].evalState).toBe(TreeEvalEnum.Included);
    component.currentPath.set('/root/\0-*.txt');
    expect(component.searchResultTreeStructure()[0].children.map((n) => n.evalState)).toEqual([
      TreeEvalEnum.Excluded,
      TreeEvalEnum.Excluded,
    ]);
  });
  it('keeps the existing showHiddenNodes search evaluation override', () => {
    const { component } = setup([entry('/root/a.txt')], { showHiddenNodes: true });
    component.currentPath.set('/root/');
    expect(component.searchResultTreeStructure()[0].children[0].evalState).toBe(TreeEvalEnum.None);
  });
  it('reacts to folder-first and case-sensitive sorting preferences', () => {
    const { component, sorting } = setup([entry('/root/z/'), entry('/root/a.txt'), entry('/root/Z.txt')]);
    expect(component.searchResultTreeStructure()[0].children.map((n) => n.text)).toEqual(['z', 'a.txt', 'Z.txt']);
    sorting.foldersFirst.set(false);
    sorting.caseSensitiveSort.set(true);
    expect(component.searchResultTreeStructure()[0].children.map((n) => n.text)).toEqual(['Z.txt', 'a.txt', 'z']);
  });
  it('does not mutate search result DTOs', () => {
    const results = [entry('/root/b.txt'), entry('/root/a.txt')];
    const before = structuredClone(results);
    const { component } = setup(results);
    component.searchResultTreeStructure();
    expect(results).toEqual(before);
  });
  it('retains server order for a browse page containing a load-more row', () => {
    const { component } = setup([], { searchMode: false, showFiles: true });
    component.treeNodes.set([
      node('/z.txt', 'z.txt'),
      node('/a.txt', 'a.txt'),
      { ...node('/more', 'Load more'), isLoadMore: true },
    ]);
    expect(component.treeStructure()[0].children.map((n) => n.text)).toEqual(['z.txt', 'a.txt', 'Load more']);
  });

  it('renders generated parents and selects only matched files', () => {
    const { component } = setup([entry('/root/a.txt'), entry('/root/b.txt')], {}, true);
    const rows = () => [...fixture.nativeElement.querySelectorAll('.browse-files [action]')] as HTMLElement[];
    expect(rows().map((row) => row.querySelector('.text span')?.textContent?.trim())).toEqual([
      'root',
      'a.txt',
      'b.txt',
    ]);
    rows()[0].click();
    fixture.detectChanges();
    expect(component.currentPath()).toBe('');
    rows()[1].click();
    fixture.detectChanges();
    expect(component.currentPath()).toBe('/root/a.txt');
    expect(fixture.nativeElement.querySelector('.active .text span')?.textContent?.trim()).toBe('a.txt');
  });

  it('replaces rendered search results without retaining prior nodes', () => {
    setup([entry('/root/a.txt')], {}, true);
    fixture.componentRef.setInput('searchResults', [entry('/different/b.txt', { 'o365:Name': 'Report' })]);
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('different');
    expect(text).toContain('Report');
    expect(text).not.toContain('a.txt');
  });
});
