import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';
import { FileTreeListingService } from './file-tree-listing.service';

describe('restore file groups', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  const paths = ['/source/one.txt', '/source/two.txt', '/source/deep/three.txt'];
  function setup(roots = paths, grouped = true) {
    const list = vi.fn(() => of([]));
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        { provide: DuplicatiServer, useValue: {} },
        { provide: FileTreeListingService, useValue: { list } },
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
    fixture = TestBed.createComponent(FileTreeComponent);
    fixture.componentRef.setInput('rootPaths', roots);
    fixture.componentRef.setInput('groupFileRoots', grouped);
    fixture.componentRef.setInput('backupSettings', { id: '42', time: '2026-11-14T00:00:00Z' });
    fixture.componentRef.setInput('multiSelect', true);
    fixture.componentRef.setInput('showFiles', true);
    fixture.detectChanges();
    list.mockClear();
    return { tree: fixture.componentInstance, list };
  }

  it('labels a collapsed display group without inventing backed-up folder metadata', () => {
    const { tree } = setup();
    expect(tree.treeStructure()).toHaveLength(1);
    const group = tree.treeStructure()[0];
    expect(group).toMatchObject({ id: 'restore-file-group:/source/', cls: 'folder', children: [] });
    expect(tree.treeItemLabel(group)).toBe('/source/ (File group)');
    expect(fixture.nativeElement.textContent).toContain('File group');
    expect(tree.treeNodeLastModified(group)).toBeNull();
    expect(group.fileSize).toBe(-1);
  });

  it('expands and collapses groups by keyboard without requesting a synthetic folder', () => {
    const { tree, list } = setup();
    const group = tree.treeStructure()[0];
    const row = fixture.nativeElement.querySelector('[role=treeitem]') as HTMLElement;
    row.focus();
    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(tree.treeStructure()[0].children.map((node) => node.text)).toEqual(['deep', 'one.txt', 'two.txt']);
    expect(list).not.toHaveBeenCalled();
    tree.toggleNode(new Event('click'), group.id!, tree.treeStructure()[0]);
    expect(tree.treeStructure()[0].children).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  it('selects only the backed-up file paths and keeps group state in sync with a child', () => {
    const { tree } = setup();
    tree.toggleSelectedNode(new Event('click'), tree.treeStructure()[0]);
    expect(tree.currentPathArray().sort()).toEqual([...paths].sort());
    fixture.detectChanges();
    expect(tree.treeSelectionState(tree.treeStructure()[0])).toBe(true);
    tree.toggleNode(new Event('click'), 'restore-file-group:/source/', tree.treeStructure()[0]);
    const file = tree.treeStructure()[0].children.find((node) => node.id === paths[0])!;
    tree.toggleSelectedNode(new Event('click'), file);
    expect(tree.currentPathArray().sort()).toEqual(paths.slice(1).sort());
    fixture.detectChanges();
    expect(tree.treeSelectionState(tree.treeStructure()[0])).toBe('mixed');
    expect(tree.currentPathArray()).not.toContain('/source/');
  });

  it('keeps real folder roots separate and preserves their existing selection', () => {
    const { tree } = setup(['/saved/', ...paths]);
    tree.toggleSelectedNode(new Event('click'), tree.treeStructure().find((node) => node.id === '/saved/')!);
    const group = tree.treeStructure().find((node) => node.id === 'restore-file-group:/source/')!;
    expect(group).toBeDefined();
    tree.toggleSelectedNode(new Event('click'), group);
    expect(tree.currentPathArray().sort()).toEqual(['/saved/', ...paths].sort());
  });

  it('recomputes group members when a version supplies different roots', () => {
    const { tree } = setup();
    fixture.componentRef.setInput('rootPaths', ['/source/new.txt', '/source/other.txt']);
    fixture.detectChanges();
    tree.toggleSelectedNode(new Event('click'), tree.treeStructure()[0]);
    expect(tree.currentPathArray().sort()).toEqual(['/source/new.txt', '/source/other.txt']);
  });

  it('preserves the existing tree when grouping is not enabled', () => {
    const { tree } = setup(paths, false);
    expect(tree.treeStructure().map((node) => node.id)).toEqual(paths);
    expect(fixture.nativeElement.textContent).not.toContain('File group');
  });
});
