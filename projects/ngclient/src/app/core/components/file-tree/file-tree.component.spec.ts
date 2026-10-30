import { describe, expect, it } from 'vitest';
import { getInheritedExclusionState, isPathWithinSources, TreeEvalEnum } from './file-tree.component';

describe('file tree exclusion inheritance', () => {
  it('marks the direct child of an excluded folder as excluded by its parent', () => {
    expect(getInheritedExclusionState(TreeEvalEnum.Excluded)).toBe(TreeEvalEnum.ExcludedByParent);
  });

  it('propagates an excluded folder state through deeper descendants', () => {
    const childState = getInheritedExclusionState(TreeEvalEnum.Excluded);
    const grandchildState = getInheritedExclusionState(childState);
    const greatGrandchildState = getInheritedExclusionState(grandchildState);

    expect(childState).toBe(TreeEvalEnum.ExcludedByParent);
    expect(grandchildState).toBe(TreeEvalEnum.ExcludedByParent);
    expect(greatGrandchildState).toBe(TreeEvalEnum.ExcludedByParent);
  });

  it.each([TreeEvalEnum.None, TreeEvalEnum.Included, null, undefined])(
    'does not inherit an exclusion from parent state %s',
    (parentState) => {
      expect(getInheritedExclusionState(parentState)).toBeNull();
    }
  );
});

describe('file tree filter scope', () => {
  it('treats a selected source and everything below a source folder as within the sources', () => {
    const sources = ['/home/user/', '/etc/hosts', '%MY_DOCUMENTS%'];

    expect(isPathWithinSources('/home/user/', null, sources)).toBe(true);
    expect(isPathWithinSources('/home/user/backup/', null, sources)).toBe(true);
    expect(isPathWithinSources('/home/user/notes.txt', null, sources)).toBe(true);
    expect(isPathWithinSources('/etc/hosts', null, sources)).toBe(true);
    expect(isPathWithinSources('%MY_DOCUMENTS%', null, sources)).toBe(true);
    expect(isPathWithinSources('C:\\Users\\me\\Documents\\', '%MY_DOCUMENTS%', sources)).toBe(true);
  });

  it('keeps folders above a source and unrelated paths outside the sources', () => {
    const sources = ['/home/user/', '/etc/hosts'];

    expect(isPathWithinSources('/', null, sources)).toBe(false);
    expect(isPathWithinSources('/home/', null, sources)).toBe(false);
    expect(isPathWithinSources('/bin/', null, sources)).toBe(false);
    expect(isPathWithinSources('/etc/', null, sources)).toBe(false);
    expect(isPathWithinSources('/etc/hosts.bak', null, sources)).toBe(false);
    expect(isPathWithinSources('/home/user2/', null, sources)).toBe(false);
  });

  it('does not treat a selected file as a prefix', () => {
    expect(isPathWithinSources('/etc/hostsfile', null, ['/etc/hosts'])).toBe(false);
  });
});
