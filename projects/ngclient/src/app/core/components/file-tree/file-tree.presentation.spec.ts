import { describe, expect, it, vi } from 'vitest';
import type { SearchEntriesItemDto } from '../../openapi';
import { FileTreeNode, TreeEvalEnum } from './file-tree.models';
import { buildSearchResultTree, SearchTreePresentation, sortFileTreeNodes } from './file-tree.presentation';

const result = (Path: string): SearchEntriesItemDto => ({
  Path,
  Metadata: null,
  Size: 10,
  Version: 0,
  Time: '',
  IsDirectory: Path.endsWith('/'),
  IsSymlink: false,
  LastModified: '',
});
const settings = (searchResults: SearchEntriesItemDto[]): SearchTreePresentation => ({
  searchResults,
  knownNames: new Map(),
  showHiddenNodes: false,
  getPathDelimiter: () => '/',
  isFolder: (path) => path.endsWith('/'),
  getDisplayName: (text) => text,
  evaluate: () => TreeEvalEnum.None,
  isIndeterminate: () => false,
  sort: { foldersFirst: true, caseSensitive: true },
});
const node = (text: string, cls = 'file', children: FileTreeNode[] = []): FileTreeNode => ({
  id: '/' + text,
  resolvedpath: '/' + text,
  text,
  cls,
  parentPath: '/',
  iconCls: null,
  check: false,
  leaf: cls === 'file',
  hidden: false,
  systemFile: false,
  temporary: false,
  symlink: false,
  fileSize: 12,
  children,
  evalState: TreeEvalEnum.None,
  isIndeterminate: false,
});

describe('search tree presentation without Angular', () => {
  it('preserves a matched symlink without marking generated parents as symlinks', () => {
    const entry = { ...result('/root/link.txt'), IsSymlink: true };
    const [root] = buildSearchResultTree(settings([entry]));
    expect(root.symlink).toBe(false);
    expect(root.children[0].symlink).toBe(true);
  });
  it('preserves matched timestamps without assigning a child timestamp to generated folders', () => {
    const entry = { ...result('/root/a.txt'), LastModified: '2026-11-05T10:00:00Z' };
    const [root] = buildSearchResultTree(settings([entry]));
    expect(root.lastModified).toBeNull();
    expect(root.children[0].lastModified).toBe(entry.LastModified);
  });
  it('accepts frozen inputs and returns new independent node graphs', () => {
    const options = settings([result('/root/a.txt')]);
    options.searchResults.forEach(Object.freeze);
    Object.freeze(options.searchResults);
    const first = buildSearchResultTree(options);
    const second = buildSearchResultTree(options);
    first[0].children.pop();
    expect(second[0].children).toHaveLength(1);
    expect(options.searchResults).toHaveLength(1);
  });
  it('uses explicit selection callbacks without changing their policy', () => {
    const options = settings([result('/root/a.txt')]);
    const evaluate = vi.fn(() => TreeEvalEnum.Excluded);
    options.evaluate = evaluate;
    options.isIndeterminate = (path) => path === '/root/';
    const [root] = buildSearchResultTree(options);
    expect(evaluate).toHaveBeenCalledWith('/root/', 'folder');
    expect(evaluate).toHaveBeenCalledWith('/root/a.txt', 'file');
    expect(root.isIndeterminate).toBe(true);
    expect(root.children[0].evalState).toBe(TreeEvalEnum.Excluded);
  });
  it('does not evaluate matched files in the existing show-hidden override', () => {
    const options = settings([result('/root/a.txt')]);
    options.showHiddenNodes = true;
    options.evaluate = vi.fn(() => TreeEvalEnum.Included);
    const [root] = buildSearchResultTree(options);
    expect(root.children[0].evalState).toBe(TreeEvalEnum.None);
    expect(options.evaluate).toHaveBeenCalledTimes(1);
  });
  it('leaves empty input empty without invoking policies', () => {
    const options = settings([]);
    options.evaluate = vi.fn();
    expect(buildSearchResultTree(options)).toEqual([]);
    expect(options.evaluate).not.toHaveBeenCalled();
  });
});

describe('file tree sorting', () => {
  it('preserves each paginated level while sorting unpaginated descendants', () => {
    const z = node('z', 'folder', [node('z.txt'), node('a.txt')]);
    const a = node('a');
    const more = { ...node('More'), isLoadMore: true };
    const nodes = [z, a, more];
    sortFileTreeNodes(nodes, { foldersFirst: false, caseSensitive: true });
    expect(nodes).toEqual([z, a, more]);
    expect(z.children.map((child) => child.text)).toEqual(['a.txt', 'z.txt']);
  });
  it('preserves server order of a paginated child group under an ordinary root', () => {
    const folder = node('folder', 'folder', [node('z'), node('a'), { ...node('More'), isLoadMore: true }]);
    const nodes = [node('z'), folder];
    sortFileTreeNodes(nodes, { foldersFirst: true, caseSensitive: true });
    expect(nodes[0]).toBe(folder);
    expect(folder.children.map((child) => child.text)).toEqual(['z', 'a', 'More']);
  });
  it('handles missing labels and keeps stable ties', () => {
    const first = { ...node('a'), text: null };
    const second = { ...node('b'), text: null };
    const nodes = [node('z'), first, second];
    sortFileTreeNodes(nodes, { foldersFirst: false, caseSensitive: true });
    expect(nodes).toEqual([first, second, expect.objectContaining({ text: 'z' })]);
  });
});
