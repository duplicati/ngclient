import { describe, expect, it } from 'vitest';
import { evaluateFileTreeFilters } from './file-tree-filter-matcher';
import { FILE_TREE_FILTER_CASES } from './testing/file-tree-filter-cases';

describe('ordered filter evaluation without Angular', () => {
  it.each(FILE_TREE_FILTER_CASES)('$name', ({ filters, path, resolved, kind, filterResult }) => {
    const expected = filterResult === 'unmatched' ? undefined : filterResult === 'include';
    expect(evaluateFileTreeFilters(filters, { path, resolvedPath: resolved, kind })).toBe(expected);
  });
  it('does not mutate its inputs', () => {
    const filters = Object.freeze(['-*.txt', '+*']);
    const target = Object.freeze({ path: '/source/a.txt', resolvedPath: '/source/a.txt', kind: 'file' });
    expect(evaluateFileTreeFilters(filters, target)).toBe(false);
    expect(filters).toEqual(['-*.txt', '+*']);
    expect(target.path).toBe('/source/a.txt');
  });
  it('keeps no match distinct from exclusion', () => {
    const target = { path: '/source/a.txt', resolvedPath: '/source/a.txt', kind: 'file' };
    expect(evaluateFileTreeFilters(['-*.zip'], target)).toBeUndefined();
    expect(evaluateFileTreeFilters(['-*.txt'], target)).toBe(false);
  });
  it('preserves existing invalid-regex error behavior', () => {
    expect(() =>
      evaluateFileTreeFilters(['-[(]'], { path: '/source/a', resolvedPath: '/source/a', kind: 'file' })
    ).toThrow(SyntaxError);
  });
});
