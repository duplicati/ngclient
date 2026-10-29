import type { TreeNodeDto } from '../../openapi';

export enum TreeEvalEnum {
  ExcludedByParent = -2,
  Excluded = -1,
  None = 0,
  Included = 1,
  IncludedByParent = 2,
}

export const getInheritedExclusionState = (
  parentState: TreeEvalEnum | null | undefined
): TreeEvalEnum.ExcludedByParent | null => {
  if (parentState === TreeEvalEnum.Excluded || parentState === TreeEvalEnum.ExcludedByParent) {
    return TreeEvalEnum.ExcludedByParent;
  }

  return null;
};

export type TreeNode = TreeNodeDto & {
  accepted?: boolean;
  parentPath: string;
  isLoadMore?: boolean;
  loadMoreOffset?: number | null;
  /** Last-modified timestamp (ISO 8601) when a listing provides one. */
  lastModified?: string | null;
};

export type FileTreeNode = TreeNode & {
  children: FileTreeNode[];
  evalState: TreeEvalEnum;
  isIndeterminate: boolean;
  isSearchMatch?: boolean;
  isGenerated?: boolean;
  hasChildrenInSearch?: boolean;
  customIcon?: string;
  remoteSource?: RemoteSource;
};

export type RemoteSource = {
  mount: string;
  prefix: string;
  url: string;
  type: string;
  path: string;
};

// The virtual root also represents the drive list on Windows.
export const ROOTPATH = '/';
