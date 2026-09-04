import { describe, expect, it } from 'vitest';
import { getInheritedExclusionState, TreeEvalEnum } from './file-tree.component';

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
