import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('file tree Shift-click selection', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });
  function setup(inputs: Record<string, unknown> = {}) {
    const list = vi.fn(({ body }: { body: { path: string } }) =>
      of(
        body.path === '/Documents/'
          ? [{ id: '/Documents/notes.txt', text: 'notes.txt', cls: 'file', leaf: true }]
          : [
              { id: '/Documents/', text: 'Documents', cls: 'folder', leaf: false },
              { id: '/Music/', text: 'Music', cls: 'folder', leaf: false },
              { id: '/readme.txt', text: 'readme.txt', cls: 'file', leaf: true },
              { id: '/.hidden/', text: '.hidden', cls: 'folder', hidden: true, leaf: false },
            ]
      )
    );
    TestBed.configureTestingModule({
      imports: [FileTreeComponent],
      providers: [
        { provide: DuplicatiServer, useValue: { postApiV1Filesystem: list } },
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
    return { component: fixture.componentInstance, list };
  }
  function click(name: string, shiftKey = false) {
    const rows = [...fixture.nativeElement.querySelectorAll('.browse-files [action]')] as HTMLElement[];
    const row = rows.find((el) => el.querySelector('.text span')?.textContent?.trim() === name);
    expect(row, name).toBeDefined();
    row!.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey }));
    fixture.detectChanges();
  }

  it('adds the visible range without toggling the anchor or existing selections off', () => {
    const { component } = setup();
    click('Documents');
    click('readme.txt', true);
    expect(component.currentPathArray()).toEqual(['/Documents/', '/Music/', '/readme.txt']);
  });

  it('supports reverse ranges and retains the anchor for repeated Shift clicks', () => {
    const { component } = setup();
    click('readme.txt');
    click('Music', true);
    expect(component.currentPathArray()).toEqual(['/readme.txt', '/Music/']);
    click('Documents', true);
    expect(component.currentPathArray()).toEqual(['/readme.txt', '/Music/', '/Documents/']);
  });

  it('falls back to a normal click without a visible anchor', () => {
    const { component } = setup();
    click('Music', true);
    expect(component.currentPathArray()).toEqual(['/Music/']);
  });

  it('keeps single-selection clicks unchanged', () => {
    const { component } = setup({ multiSelect: false });
    click('Documents');
    click('Music', true);
    expect(component.currentPathArray()).toEqual(['/Music/']);
  });

  it('does not select hidden rows or unloaded children', () => {
    const { component } = setup();
    click('Documents');
    click('readme.txt', true);
    expect(component.currentPathArray()).not.toContain('/.hidden/');
    expect(component.currentPathArray()).not.toContain('/Documents/notes.txt');
  });

  it('keeps folder-only restrictions within a range', () => {
    const { component } = setup({ onlySelectFolder: true });
    click('Music');
    click('Documents', true);
    expect(component.currentPathArray()).toEqual(['/Music/', '/Documents/']);
    click('readme.txt', true);
    expect(component.currentPathArray()).toEqual(['/Music/', '/Documents/']);
  });

  it('does not change selection while disabled', () => {
    const { component } = setup();
    click('Documents');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    click('readme.txt', true);
    expect(component.currentPathArray()).toEqual(['/Documents/']);
  });

  function files(component: FileTreeComponent, names: string[]) {
    component.treeNodes.set(
      names.map((name) => ({
        ...component.treeNodes()[0],
        id: '/' + name,
        text: name,
        cls: 'file',
        leaf: true,
        hidden: name.startsWith('.'),
        parentPath: '/',
      }))
    );
    fixture.detectChanges();
  }

  it('selects intermediate files in reverse order and keeps unrelated selections', () => {
    const { component } = setup();
    files(component, ['a.txt', 'b.txt', 'c.txt', 'd.txt', 'e.txt']);
    click('e.txt');
    click('d.txt');
    click('a.txt', true);
    expect(new Set(component.currentPathArray())).toEqual(new Set(['/e.txt', '/d.txt', '/a.txt', '/b.txt', '/c.txt']));
  });

  it('skips hidden rows and rejected file extensions inside the range', () => {
    const { component } = setup({ accepts: '.txt' });
    files(component, ['a.txt', 'b.png', 'c.txt', '.hidden.txt', 'z.txt']);
    click('a.txt');
    click('z.txt', true);
    expect(component.currentPathArray()).toEqual(['/a.txt', '/c.txt', '/z.txt']);
  });

  it('falls back to a new anchor when the old anchor is no longer visible', () => {
    const { component } = setup();
    click('Documents');
    files(component, ['a.txt', 'b.txt', 'c.txt']);
    click('a.txt', true);
    click('c.txt', true);
    expect(component.currentPathArray()).toEqual(['/Documents/', '/a.txt', '/b.txt', '/c.txt']);
  });

  it('does not turn inherited selections into exclusions', () => {
    const { component } = setup();
    const node = component.treeStructure()[0].children.find((n) => n.text === 'Documents')!;
    component.toggleNode(new Event('click'), node.id!, node);
    fixture.detectChanges();
    click('Documents');
    click('readme.txt', true);
    expect(component.currentPathArray()).toEqual(['/Documents/', '/Music/', '/readme.txt']);
    expect(component.currentPathArray().some((path) => path.startsWith('-'))).toBe(false);
  });

  it('does not expand folders while selecting a file-only range', () => {
    const { component, list } = setup({ selectFiles: true });
    files(component, ['a.txt', 'z.txt']);
    component.treeNodes.update((nodes) => [
      ...nodes,
      { ...nodes[0], id: '/m/', text: 'm', cls: 'folder', leaf: false, parentPath: '/' },
    ]);
    fixture.detectChanges();
    const calls = list.mock.calls.length;
    click('a.txt');
    click('z.txt', true);
    expect(component.currentPathArray()).toEqual(['/a.txt', '/z.txt']);
    expect(list).toHaveBeenCalledTimes(calls);
  });
});
