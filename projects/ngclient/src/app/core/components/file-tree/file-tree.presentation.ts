import type { SearchEntriesItemDto } from '../../openapi';
import { FileTreeNode, ROOTPATH, TreeEvalEnum } from './file-tree.models';

export interface FileTreeSortPreferences {
  foldersFirst: boolean;
  caseSensitive: boolean;
}

export interface SearchTreePresentation {
  searchResults: readonly SearchEntriesItemDto[];
  knownNames: ReadonlyMap<string, string>;
  showHiddenNodes: boolean;
  getPathDelimiter: (path: string) => string;
  isFolder: (path: string) => boolean;
  getDisplayName: (text?: string | null, metadata?: SearchEntriesItemDto['Metadata']) => string | null | undefined;
  evaluate: (path: string, kind: 'folder' | 'file') => TreeEvalEnum;
  isIndeterminate: (path: string) => boolean;
  sort: FileTreeSortPreferences;
}

/** Builds display nodes without modifying DTOs or requesting data. */
export function buildSearchResultTree(options: SearchTreePresentation): FileTreeNode[] {
  const {
    searchResults,
    knownNames,
    showHiddenNodes,
    getPathDelimiter,
    isFolder: isFolderPath,
    getDisplayName,
    evaluate,
    isIndeterminate,
    sort,
  } = options;
  if (searchResults.length === 0) return [];
  // Build path info map from search results
  const pathInfoMap = new Map<
    string,
    { part: string; parentPath: string; isFolder: boolean; match: SearchEntriesItemDto | null }
  >();

  for (const searchEntry of searchResults) {
    const resultPath = searchEntry.Path ?? '';
    const pathDelimiter = getPathDelimiter(resultPath);
    // Preserve the leading separators of the original path (Posix or UNC)
    let rootPrefix = '';
    while (pathDelimiter !== '' && resultPath.startsWith(rootPrefix + pathDelimiter)) {
      rootPrefix += pathDelimiter;
    }
    const parts = resultPath.split(pathDelimiter).filter((p) => p !== '');

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;
      const isFolder = !isLastPart || isFolderPath(resultPath);

      const parentPath = currentPath || ROOTPATH;
      const prefix = currentPath
        ? currentPath.endsWith(pathDelimiter)
          ? currentPath.slice(0, -pathDelimiter.length)
          : currentPath
        : '';
      currentPath = prefix ? `${prefix}${pathDelimiter}${part}` : `${rootPrefix}${part}`;
      if (isFolder && !currentPath.endsWith(pathDelimiter)) {
        currentPath += pathDelimiter;
      }

      if (!pathInfoMap.has(currentPath)) {
        pathInfoMap.set(currentPath, {
          part,
          parentPath,
          isFolder,
          match: isLastPart ? searchEntry : null,
        });
      } else if (isLastPart) {
        const existing = pathInfoMap.get(currentPath)!;
        existing.match = searchEntry;
      }
    }
  }

  // Build children map
  const childrenMap = new Map<string, string[]>();
  for (const [path, info] of pathInfoMap) {
    if (!childrenMap.has(info.parentPath)) {
      childrenMap.set(info.parentPath, []);
    }
    childrenMap.get(info.parentPath)!.push(path);
  }

  const nameOf = (path: string, info: { part: string; match: SearchEntriesItemDto | null }) =>
    getDisplayName(knownNames.get(path) ?? info.part, info.match?.Metadata) ?? info.part;

  // Determine which paths are "visible" (not collapsed into a parent chain)
  // and what their collapsed display text should be
  const visiblePaths = new Set<string>();
  const collapsedTextMap = new Map<string, string>(); // visible path -> display text

  for (const [path, info] of pathInfoMap) {
    if (!info.isFolder) {
      // Files are always visible
      visiblePaths.add(path);
      continue;
    }

    // A folder is hidden (collapsed into its parent) if:
    // - Its parent has exactly ONE child total
    // - AND that one child is this folder
    //
    // This means the folder is just a passthrough with no siblings.
    // We collapse it into the nearest visible ancestor.

    const parentChildren = childrenMap.get(info.parentPath) || [];
    const isOnlyChild = parentChildren.length === 1 && parentChildren[0] === path;

    if (isOnlyChild && info.parentPath !== ROOTPATH) {
      // This folder is hidden - collapsed into parent
      continue;
    }

    // This folder is visible
    visiblePaths.add(path);

    // Build collapsed text if this folder starts a single-child chain
    // Walk down the chain and concatenate names
    const chainDelimiter = getPathDelimiter(path);
    let chainText = nameOf(path, info);
    let chainPath = path;
    while (true) {
      const chainChildren = childrenMap.get(chainPath) || [];
      if (chainChildren.length !== 1) break;

      const nextPath = chainChildren[0];
      const nextInfo = pathInfoMap.get(nextPath);
      if (!nextInfo || !nextInfo.isFolder) break;

      chainText += chainDelimiter + nameOf(nextPath, nextInfo);
      chainPath = nextPath;
    }

    // Only set collapsed text if we actually collapsed something
    if (chainPath !== path) {
      collapsedTextMap.set(path, chainText);
    }
  }

  // Also make root visible
  visiblePaths.add(ROOTPATH);

  // Build the tree without a root node
  // Top-level items are direct children of an implicit root
  const topLevelNodes: FileTreeNode[] = [];
  const nodeMap = new Map<string, FileTreeNode>();

  // Sort visible paths by depth, so a parent is always created before its children
  const pathDepth = (path: string) => path.split(getPathDelimiter(path)).filter((x) => x !== '').length;
  const sortedPaths = Array.from(visiblePaths)
    .filter((p) => p !== ROOTPATH)
    .sort((a, b) => pathDepth(a) - pathDepth(b) || a.localeCompare(b));

  for (const path of sortedPaths) {
    const info = pathInfoMap.get(path);
    if (!info) continue;

    // Find the actual parent in the visible tree
    let parentPath = info.parentPath;
    while (parentPath !== ROOTPATH && !visiblePaths.has(parentPath)) {
      const parentInfo = pathInfoMap.get(parentPath);
      parentPath = parentInfo?.parentPath || ROOTPATH;
    }

    // Check if a node with this id already exists
    if (nodeMap.has(path)) continue;

    const displayText = collapsedTextMap.get(path) ?? nameOf(path, info);
    const isGenerated = info.match === null;

    const evalState =
      info.match !== null && !info.isFolder && showHiddenNodes
        ? TreeEvalEnum.None
        : evaluate(path, info.isFolder ? 'folder' : 'file');

    const newNode: FileTreeNode = {
      id: path,
      resolvedpath: path,
      text: displayText,
      parentPath: parentPath,
      children: [],
      evalState: evalState,
      isIndeterminate: isIndeterminate(path),
      cls: info.isFolder ? 'folder' : 'file',
      isSearchMatch: info.match !== null,
      isGenerated: isGenerated,
      hasChildrenInSearch: (childrenMap.get(path)?.length || 0) > 0,
      iconCls: null,
      check: false,
      leaf: !info.isFolder,
      hidden: false,
      systemFile: false,
      temporary: false,
      symlink: info.match?.IsSymlink ?? false,
      fileSize: info.match?.Size ?? 0,
      lastModified: info.match?.LastModified ?? null,
    };

    nodeMap.set(path, newNode);

    if (parentPath === ROOTPATH) {
      topLevelNodes.push(newNode);
    } else {
      const parentNode = nodeMap.get(parentPath);
      if (parentNode) {
        parentNode.children.push(newNode);
      }
    }
  }

  sortFileTreeNodes(topLevelNodes, sort);
  return topLevelNodes;
}

// Sorts the nodes according to the user's sort preferences.
// Children of paginated sources (detected by the presence of a "load more"
// node) are paginated and sorted on the server, so they are left in server
// order. Unpaginated sources never produce "load more" nodes.
export function sortFileTreeNodes(nodes: FileTreeNode[], preferences: FileTreeSortPreferences) {
  const { foldersFirst, caseSensitive } = preferences;
  const isPaginated = nodes.some((x) => x.isLoadMore);

  if (!isPaginated) {
    nodes.sort((a, b) => {
      if (foldersFirst) {
        if (a.cls === 'folder' && b.cls !== 'folder') return -1;
        if (a.cls !== 'folder' && b.cls === 'folder') return 1;
      }

      const aText = a.text ?? '';
      const bText = b.text ?? '';

      return caseSensitive
        ? aText < bText
          ? -1
          : aText > bText
            ? 1
            : 0
        : aText.localeCompare(bText, undefined, { sensitivity: 'base' });
    });
  }

  nodes.forEach((node) => sortFileTreeNodes(node.children, preferences));
}
