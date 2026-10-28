import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('file tree keyboard navigation', () => {
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
  function row(name: string): HTMLElement {
    const element = [...fixture.nativeElement.querySelectorAll('[role=treeitem]')].find(
      (el: HTMLElement) => el.getAttribute('aria-label') === name
    );
    expect(element, 'Tree item: ' + name).toBeDefined();
    return element;
  }
  function press(element: HTMLElement, key: string) {
    element.focus();
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    element.dispatchEvent(event);
    fixture.detectChanges();
    return event;
  }

  it('has one Tab entry, hierarchical roles and a name for each node', () => {
    setup();
    const tree = fixture.nativeElement.querySelector('[role=tree]');
    expect(tree).not.toBeNull();
    expect(tree.getAttribute('aria-multiselectable')).toBe('true');
    expect(fixture.nativeElement.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
    expect(row('Computer').getAttribute('aria-expanded')).toBe('true');
    expect(row('Documents').getAttribute('aria-expanded')).toBe('false');
    expect(row('readme.txt').hasAttribute('aria-expanded')).toBe(false);
    expect(row('Documents').getAttribute('aria-level')).toBe('2');
  });

  it('moves through visible rows with arrows, Home and End without changing selection', () => {
    const { component } = setup();
    expect(press(row('Computer'), 'ArrowDown').defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(row('Documents'));
    press(row('Documents'), 'ArrowDown');
    expect(document.activeElement).toBe(row('Music'));
    press(row('Music'), 'End');
    expect(document.activeElement).toBe(row('readme.txt'));
    press(row('readme.txt'), 'ArrowUp');
    expect(document.activeElement).toBe(row('Music'));
    press(row('Music'), 'Home');
    expect(document.activeElement).toBe(row('Computer'));
    expect(component.currentPath()).toBe('');
    expect(fixture.nativeElement.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
  });

  it('expands, enters, returns to and collapses a folder with right and left arrows', () => {
    const { list } = setup();
    press(row('Documents'), 'ArrowRight');
    expect(row('Documents').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(row('Documents'));
    press(row('Documents'), 'ArrowRight');
    expect(document.activeElement).toBe(row('notes.txt'));
    press(row('notes.txt'), 'ArrowLeft');
    expect(document.activeElement).toBe(row('Documents'));
    press(row('Documents'), 'ArrowLeft');
    expect(row('Documents').getAttribute('aria-expanded')).toBe('false');
    expect(list).toHaveBeenCalledTimes(2);
    expect(list).toHaveBeenLastCalledWith({
      query: { showHidden: true, onlyFolders: false },
      body: { path: '/Documents/' },
    });
  });

  it('toggles selection with Space and Enter while focus remains independent', () => {
    const { component } = setup();
    press(row('Documents'), ' ');
    expect(component.currentPath()).toBe('/Documents/');
    expect(row('Documents').getAttribute('aria-checked')).toBe('true');
    press(row('Documents'), 'ArrowDown');
    expect(component.currentPath()).toBe('/Documents/');
    press(row('Music'), 'Enter');
    expect(component.currentPath().split('\0')).toEqual(['/Documents/', '/Music/']);
    press(row('Music'), ' ');
    expect(component.currentPath()).toBe('/Documents/');
  });

  it('uses single-selection semantics without a checkbox state', () => {
    const { component } = setup({ multiSelect: false });
    press(row('Documents'), ' ');
    expect(row('Documents').getAttribute('aria-selected')).toBe('true');
    expect(row('Documents').hasAttribute('aria-checked')).toBe(false);
    press(row('Music'), 'Enter');
    expect(component.currentPath()).toBe('/Music/');
  });

  it('does not select an unacceptable file or a disabled tree', () => {
    const { component } = setup({ accepts: '.jpg' });
    press(row('readme.txt'), ' ');
    expect(component.currentPath()).toBe('');
    fixture.componentRef.setInput('disabled', true);
    fixture.detectChanges();
    press(row('Documents'), 'Enter');
    expect(component.currentPath()).toBe('');
    expect(fixture.nativeElement.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(0);
  });

  it('skips hidden rows and supports finding a row by typing its name', () => {
    setup();
    press(row('Computer'), 'm');
    expect(document.activeElement).toBe(row('Music'));
    press(row('Music'), 'Home');
    press(row('Computer'), 'd');
    expect(document.activeElement).toBe(row('Documents'));
    press(row('Documents'), 'o');
    expect(document.activeElement).toBe(row('Documents'));
    expect(fixture.nativeElement.querySelector('[aria-label=".hidden"]')).toBeNull();
  });

  it('announces a partially selected parent without changing the selection', () => {
    const { component } = setup();
    press(row('Documents'), 'ArrowRight');
    press(row('notes.txt'), ' ');
    expect(row('Documents').getAttribute('aria-checked')).toBe('mixed');
    expect(row('notes.txt').getAttribute('aria-checked')).toBe('true');
    expect(component.currentPath()).toBe('/Documents/notes.txt');
  });

  it('keeps file-only and folder-only activation rules', () => {
    const { component } = setup({ selectFiles: true });
    press(row('Documents'), 'Enter');
    expect(row('Documents').getAttribute('aria-expanded')).toBe('true');
    expect(component.currentPath()).toBe('');
    press(row('notes.txt'), ' ');
    expect(component.currentPath()).toBe('/Documents/notes.txt');
    fixture.componentRef.setInput('selectFiles', false);
    fixture.componentRef.setInput('onlySelectFolder', true);
    fixture.detectChanges();
    press(row('readme.txt'), 'Enter');
    expect(component.currentPath()).toBe('/Documents/notes.txt');
  });

  it('does not consume Tab or modified browser shortcuts', () => {
    setup();
    expect(press(row('Computer'), 'Tab').defaultPrevented).toBe(false);
    const event = new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true });
    row('Documents').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
