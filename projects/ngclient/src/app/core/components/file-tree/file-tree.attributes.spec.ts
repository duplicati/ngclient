import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('file tree attribute exclusion feedback', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  const defaultListing: Record<string, unknown[]> = {
    '/': [
      { id: '/Documents/', text: 'Documents', cls: 'folder', leaf: false },
      { id: '/Music/', text: 'Music', cls: 'folder', leaf: false },
      { id: '/readme.txt', text: 'readme.txt', cls: 'file', leaf: true },
      { id: '/.hidden/', text: '.hidden', cls: 'folder', hidden: true, leaf: false },
    ],
    '/Documents/': [{ id: '/Documents/notes.txt', text: 'notes.txt', cls: 'file', leaf: true }],
  };
  function configure(providers: unknown[], inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        ...providers,
        {
          provide: SysinfoState,
          useValue: {
            systemInfo: signal({ DirectorySeparator: '/' }),
            filterGroups: signal({}),
            hasV2FilterOperations: () => false,
            hasV2ListBackendOperations: () => false,
            resolveShorthandPath: (path: string) => path,
          },
        },
        { provide: FileTreeState, useValue: { foldersFirst: signal(true), caseSensitiveSort: signal(false) } },
        { provide: ShipDialogService, useValue: {} },
      ],
    });
    fixture = TestBed.createComponent(FileTreeComponent);
    fixture.componentRef.setInput('multiSelect', true);
    fixture.componentRef.setInput('showFiles', true);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  function setup(inputs: Record<string, unknown> = {}, listing: Record<string, unknown[]> = {}) {
    const entries = { ...defaultListing, ...listing };
    const list = vi.fn(({ body }: { body: { path: string } }) => of(entries[body.path] ?? []));
    const component = configure([{ provide: DuplicatiServer, useValue: { postApiV1Filesystem: list } }], inputs);
    return { component, list };
  }

  it('marks matching attributes and descendants without changing selected paths', () => {
    const { component } = setup({ excludedAttributes: ['Hidden', 'System'], showHiddenNodes: true });
    component.currentPath.set('/Documents/');
    component.treeNodes.set([
      { id: '/Documents/', text: 'Documents', cls: 'folder', parentPath: '/', leaf: false },
      { id: '/Documents/hidden.txt', text: 'hidden.txt', cls: 'file', parentPath: '/Documents/', hidden: true },
      { id: '/Documents/system.txt', text: 'system.txt', cls: 'file', parentPath: '/Documents/', systemFile: true },
      { id: '/Documents/cache/', text: 'cache', cls: 'folder', parentPath: '/Documents/', hidden: true },
      { id: '/Documents/cache/child.txt', text: 'child.txt', cls: 'file', parentPath: '/Documents/cache/' },
      { id: '/Documents/normal.txt', text: 'normal.txt', cls: 'file', parentPath: '/Documents/' },
    ] as any);
    fixture.detectChanges();
    const root = component.treeStructure()[0];
    const documents = root.children.find((n) => n.text === 'Documents')!;
    const hidden = documents.children.find((n) => n.text === 'hidden.txt')!;
    const system = documents.children.find((n) => n.text === 'system.txt')!;
    const cache = documents.children.find((n) => n.text === 'cache')!;
    expect(component.treeItemLabel(hidden)).toContain('Excluded by Hidden attribute');
    expect(component.treeItemLabel(system)).toContain('Excluded by System attribute');
    expect(component.treeItemLabel(cache.children[0])).toContain('Excluded by parent attribute');
    expect(component.treeItemLabel(documents.children.find((n) => n.text === 'normal.txt')!)).not.toContain('Excluded');
    expect(component.currentPath()).toBe('/Documents/');
    fixture.componentRef.setInput('excludedAttributes', []);
    fixture.detectChanges();
    expect(
      component.treeItemLabel(component.treeStructure()[0].children[0].children.find((n) => n.text === 'hidden.txt')!)
    ).not.toContain('Excluded');
  });

  it('keeps explicitly selected roots included even when their attribute matches', () => {
    const { component } = setup({ excludedAttributes: ['hIdDeN'], showHiddenNodes: true });
    component.currentPath.set('/Documents/\0/Documents/hidden.txt');
    component.treeNodes.set([
      { id: '/Documents/', text: 'Documents', cls: 'folder', parentPath: '/', hidden: true },
      { id: '/Documents/hidden.txt', text: 'hidden.txt', cls: 'file', parentPath: '/Documents/', hidden: true },
      { id: '/Documents/other.txt', text: 'other.txt', cls: 'file', parentPath: '/Documents/', hidden: true },
    ] as any);
    fixture.detectChanges();
    const documents = component.treeStructure()[0].children[0];
    expect(component.treeItemLabel(documents)).not.toContain('Excluded');
    expect(component.treeItemLabel(documents.children.find((n) => n.text === 'hidden.txt')!)).not.toContain('Excluded');
    expect(component.treeItemLabel(documents.children.find((n) => n.text === 'other.txt')!)).toContain(
      'Excluded by Hidden attribute'
    );
  });

  it('does not guess unsupported attribute flags', () => {
    const { component } = setup({ excludedAttributes: ['Archive'], showHiddenNodes: true });
    component.currentPath.set('/');
    component.treeNodes.set([
      { id: '/hidden.txt', text: 'hidden.txt', cls: 'file', parentPath: '/', hidden: true },
    ] as any);
    fixture.detectChanges();
    expect(component.treeItemLabel(component.treeStructure()[0].children[0])).not.toContain('Excluded');
  });
  it('matches Windows source roots case-insensitively', () => {
    const { component } = setup({ excludedAttributes: ['Hidden'], showHiddenNodes: true });
    const info = TestBed.inject(SysinfoState) as any;
    info.systemInfo.set({ DirectorySeparator: '\\' });
    component.currentPath.set('c:\\data\\\0C:\\DATA\\explicit.txt');
    component.treeNodes.set([
      { id: 'C:\\Data\\', text: 'Data', cls: 'folder', parentPath: '/', hidden: true },
      { id: 'C:\\Data\\explicit.txt', text: 'explicit.txt', cls: 'file', parentPath: 'C:\\Data\\', hidden: true },
      { id: 'C:\\Data\\child.txt', text: 'child.txt', cls: 'file', parentPath: 'C:\\Data\\', hidden: true },
    ] as any);
    fixture.detectChanges();
    const folder = component.treeStructure()[0].children[0];
    expect(component.treeItemLabel(folder)).not.toContain('Excluded');
    expect(component.treeItemLabel(folder.children.find((n) => n.text === 'explicit.txt')!)).not.toContain('Excluded');
    expect(component.treeItemLabel(folder.children.find((n) => n.text === 'child.txt')!)).toContain(
      'Excluded by Hidden attribute'
    );
  });
  it('selects an attribute-excluded file as an explicit source', () => {
    const { component } = setup({ rootPaths: ['/Documents/'], excludedAttributes: ['Hidden'], showHiddenNodes: true });
    component.currentPath.set('/Documents/');
    component.treeNodes.set([
      { id: '/Documents/hidden.txt', text: 'hidden.txt', cls: 'file', parentPath: '/Documents/', hidden: true },
    ] as any);
    fixture.detectChanges();
    const root = component.treeStructure()[0];
    if (!component.isTreeNodeExpanded(root)) component.toggleNode(new Event('click'), root.id!, root);
    fixture.detectChanges();
    const hidden = component.treeStructure()[0].children.find((n) => n.text === 'hidden.txt')!;
    expect(component.treeItemLabel(hidden)).toContain('Excluded by Hidden attribute');
    component.toggleSelectedNode(new Event('click'), hidden);
    fixture.detectChanges();
    expect(component.currentPath().split('\0')).toContain('/Documents/hidden.txt');
    expect(
      component.treeItemLabel(component.treeStructure()[0].children.find((n) => n.text === 'hidden.txt')!)
    ).not.toContain('Excluded');
  });
});
