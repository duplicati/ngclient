import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

// https://github.com/duplicati/duplicati/issues/3191: a backed-up folder must not look fully
// backed up when a path inside it has been excluded.
describe('file tree marks folders with excluded descendants', () => {
  let fixture: ComponentFixture<FileTreeComponent>;
  afterEach(() => {
    fixture?.destroy();
    TestBed.resetTestingModule();
  });

  const listing: Record<string, unknown[]> = {
    '/': [
      { id: '/home/', text: 'home', cls: 'folder', leaf: false },
      { id: '/srv/', text: 'srv', cls: 'folder', leaf: false },
      { id: '/linked/', text: 'linked', cls: 'folder', leaf: false, symlink: true, symlinkTarget: '/Target/' },
    ],
    '/home/': [{ id: '/home/user/', text: 'user', cls: 'folder', leaf: false }],
    '/home/user/': [
      { id: '/home/user/docs/', text: 'docs', cls: 'folder', leaf: false },
      { id: '/home/user/cache/', text: 'cache', cls: 'folder', leaf: false },
    ],
  };

  function setup(currentPath: string, inputs: Record<string, unknown> = {}) {
    const list = vi.fn(({ body }: { body: { path: string } }) => of(listing[body.path] ?? []));
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
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const tree = fixture.componentInstance;
    tree.currentPath.set(currentPath);
    for (const folder of ['/home/', '/home/user/']) {
      const stack = [...tree.treeStructure()];
      while (stack.length) {
        const node = stack.pop()!;
        if (node.id === folder) tree.toggleNode(new Event('click'), folder, node);
        stack.push(...node.children);
      }
    }
    fixture.detectChanges();
    return tree;
  }

  function row(name: string): HTMLElement {
    const element = [...fixture.nativeElement.querySelectorAll('[role=treeitem]')].find(
      (el: HTMLElement) => el.querySelector('.text span')?.textContent?.trim() === name
    );
    expect(element, 'Tree item: ' + name).toBeDefined();
    return element;
  }

  const partial = (name: string) => row(name).classList.contains('partially-excluded');

  it('marks the selected folder and the folders between it and an excluded subfolder', () => {
    setup('/home/\0-/home/user/cache/');

    expect(partial('home')).toBe(true);
    expect(partial('user')).toBe(true);
    expect(row('home').getAttribute('aria-description')).toBe('Some items inside this folder are excluded');
    // The excluded folder itself and its unaffected siblings are not partial
    expect(partial('cache')).toBe(false);
    expect(partial('docs')).toBe(false);
    expect(row('docs').getAttribute('aria-description')).toBeNull();
    // Folders outside the backup are not marked, even above the exclusion
    expect(partial('srv')).toBe(false);
  });

  it('does not mark a selected folder whose only filters are elsewhere', () => {
    setup('/home/\0-/srv/tmp/');

    expect(partial('home')).toBe(false);
    expect(partial('user')).toBe(false);
  });

  it('announces both the link target and excluded descendants', () => {
    setup('/linked/\0-/linked/excluded/');

    expect(row('linked').getAttribute('aria-description')).toBe(
      'Link target: /Target/; Some items inside this folder are excluded'
    );
  });

  it('does not mark a folder that is selected without any exclusion', () => {
    setup('/home/');

    expect(row('home').classList.contains('active')).toBe(true);
    expect(partial('home')).toBe(false);
  });
});
