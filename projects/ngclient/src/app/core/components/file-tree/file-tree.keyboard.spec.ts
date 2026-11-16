import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ShipDialogService } from '@ship-ui/core/ship-dialog';
import { of, throwError } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DuplicatiServer } from '../../openapi';
import { FileTreeListingService } from './file-tree-listing.service';
import { FileTreeState } from '../../states/file-tree.state';
import { SysinfoState } from '../../states/sysinfo.state';
import FileTreeComponent from './file-tree.component';

describe('file tree keyboard navigation', () => {
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
  // Pages of the root listing, keyed by the offset the component asks for.
  function setupPaged(pages: Record<string, { items: unknown[]; hasMore: boolean; nextOffset: number }>) {
    const list = vi.fn((_path: string, _remote: unknown, _context: unknown, offset: number | null) =>
      of(pages[String(offset)])
    );
    const component = configure(
      [
        { provide: DuplicatiServer, useValue: {} },
        { provide: FileTreeListingService, useValue: { list } },
      ],
      {}
    );
    return { component, list };
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

  const lockedFolder = { id: '/Cookies/', text: 'Cookies', cls: 'folder', leaf: true, kind: 'locked', symlink: true };

  it('keeps a locked folder selectable without offering or requesting expansion', () => {
    const { component, list } = setup({}, { '/': [lockedFolder] });
    const cookies = row('Cookies (Symbolic link, Access denied)');
    expect(cookies.querySelector('.text')?.textContent).toContain('Access denied');
    const icon = cookies.querySelector<HTMLElement>('.icon')!;
    icon.click();
    press(cookies, 'ArrowRight');
    expect(list.mock.calls.map(([request]) => request.body.path)).toEqual(['/']);
    expect(cookies.hasAttribute('aria-expanded')).toBe(false);
    expect(icon.textContent).not.toMatch(/caret-right|caret-down/);

    press(cookies, 'Enter');
    expect(component.currentPath()).toBe('/Cookies/');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('does not expand a locked folder when activation is used to browse for files', () => {
    const { list } = setup({ selectFiles: true }, { '/': [lockedFolder] });
    row('Cookies (Symbolic link, Access denied)').querySelector<HTMLElement>('.text')!.click();
    press(row('Cookies (Symbolic link, Access denied)'), 'Enter');
    expect(list.mock.calls.map(([request]) => request.body.path)).toEqual(['/']);
  });

  it('still expands an empty folder and a junction without the locked kind', () => {
    const { list } = setup(
      {},
      {
        '/': [
          { id: '/Empty/', text: 'Empty', cls: 'folder', leaf: true },
          { id: '/Link/', text: 'Link', cls: 'folder', symlink: true, kind: 'junction', leaf: false },
        ],
        '/Link/': [{ id: '/Link/notes.txt', text: 'notes.txt', cls: 'file', leaf: true }],
      }
    );
    press(row('Empty'), 'ArrowRight');
    expect(row('Empty').getAttribute('aria-expanded')).toBe('true');
    press(row('Link (Symbolic link)'), 'ArrowRight');
    expect(row('Link (Symbolic link)').getAttribute('aria-expanded')).toBe('true');
    expect(row('notes.txt')).toBeDefined();
    expect(list.mock.calls.map(([request]) => request.body.path)).toEqual(['/', '/Empty/', '/Link/']);
  });

  it.each([
    [500, 'An error occurred'],
    [403, 'Access to the folder is denied: /Documents/'],
  ])('shows the error from a failed child request (HTTP %s)', (status, message) => {
    const { list } = setup();
    list.mockImplementationOnce(() => throwError(() => ({ status, message })));
    press(row('Documents'), 'ArrowRight');
    expect(row('Documents').getAttribute('aria-expanded')).toBe('false');
    expect(fixture.nativeElement.querySelector('sh-alert').textContent).toContain(message);
  });

  it('shows a junction target without using it as the selected path', () => {
    const { component } = setup(
      { resolvePaths: true },
      {
        '/': [
          { id: '/Link/', text: 'Link', cls: 'folder', symlink: true, resolvedpath: null, symlinkTarget: '/Target/' },
          {
            id: '%HOME%/Cookies/',
            text: 'Cookies',
            cls: 'folder',
            symlink: true,
            resolvedpath: '/home/user/Cookies/',
            symlinkTarget: '/Target/',
          },
        ],
      }
    );
    for (const [label, path] of [
      ['Link', '/Link/'],
      ['Cookies', '/home/user/Cookies/'],
    ]) {
      const link = row(label + ' (Symbolic link)');
      expect(link.querySelector('.icon')?.getAttribute('title')).toBe('Link target: /Target/');
      expect(link.getAttribute('aria-description')).toBe('Link target: /Target/');
      press(link, 'Enter');
      expect(component.currentPathArray()).toContain(path);
      expect(component.currentPathResolved()).not.toContain('/Target/');
      press(link, 'Enter');
    }
  });

  it.each([null, undefined])('keeps the existing badge for a link with target %s', (symlinkTarget) => {
    const { component } = setup(
      { resolvePaths: true },
      {
        '/': [
          { id: '/Link/', text: 'Link', cls: 'folder', symlink: true, symlinkTarget, resolvedpath: '/LegacyTarget/' },
        ],
      }
    );
    const link = row('Link (Symbolic link)');
    expect(link.querySelector('.icon')?.getAttribute('title')).toBe('Symbolic link');
    expect(link.hasAttribute('aria-description')).toBe(false);
    press(link, 'Enter');
    expect(component.currentPath()).toBe('/LegacyTarget/');
  });

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

  it('keeps a folder with only hidden children expanded on ArrowRight', () => {
    const { list } = setup(
      {},
      { '/Music/': [{ id: '/Music/.cache/', text: '.cache', cls: 'folder', hidden: true, leaf: false }] }
    );
    press(row('Music'), 'ArrowRight');
    expect(row('Music').getAttribute('aria-expanded')).toBe('true');
    press(row('Music'), 'ArrowRight');
    expect(row('Music').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(row('Music'));
    expect(list).toHaveBeenCalledTimes(2);
    press(row('Music'), 'ArrowLeft');
    expect(row('Music').getAttribute('aria-expanded')).toBe('false');
  });

  it('treats an empty folder as expanded until it is collapsed', () => {
    const { list } = setup({}, { '/Music/': [] });
    press(row('Music'), 'ArrowRight');
    expect(row('Music').getAttribute('aria-expanded')).toBe('true');
    press(row('Music'), 'ArrowRight');
    expect(list).toHaveBeenCalledTimes(2);
    press(row('Music'), 'ArrowLeft');
    expect(row('Music').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(row('Music'));
    press(row('Music'), 'ArrowRight');
    expect(list).toHaveBeenCalledTimes(3);
  });

  it('ignores Enter and Space on the root row', () => {
    const { component, list } = setup();
    press(row('Computer'), 'Enter');
    press(row('Computer'), ' ');
    expect(row('Documents').getAttribute('aria-level')).toBe('2');
    expect(component.currentPath()).toBe('');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on the pagination row and moves it to the last loaded row after the final page', async () => {
    const { list } = setupPaged({
      null: {
        items: [{ id: '/Documents/', text: 'Documents', cls: 'folder', leaf: false }],
        hasMore: true,
        nextOffset: 1,
      },
      '1': { items: [{ id: '/Music/', text: 'Music', cls: 'folder', leaf: false }], hasMore: true, nextOffset: 2 },
      '2': {
        items: [{ id: '/readme.txt', text: 'readme.txt', cls: 'file', leaf: true }],
        hasMore: false,
        nextOffset: 3,
      },
    });
    press(row('Documents'), 'ArrowDown');
    expect(document.activeElement).toBe(row('Load more'));
    press(row('Load more'), ' ');
    expect(list).toHaveBeenLastCalledWith('/', undefined, expect.anything(), 1);
    expect(row('Music').getAttribute('aria-level')).toBe('2');
    expect(document.activeElement).toBe(row('Load more'));
    press(row('Load more'), 'Enter');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-label="Load more"]')).toBeNull();
    expect(document.activeElement).toBe(row('readme.txt'));
    expect(fixture.nativeElement.querySelectorAll('[role=treeitem][tabindex="0"]')).toHaveLength(1);
  });

  it('does not consume Tab or modified browser shortcuts', () => {
    setup();
    expect(press(row('Computer'), 'Tab').defaultPrevented).toBe(false);
    const event = new KeyboardEvent('keydown', { key: 'Home', ctrlKey: true, bubbles: true, cancelable: true });
    row('Documents').dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
