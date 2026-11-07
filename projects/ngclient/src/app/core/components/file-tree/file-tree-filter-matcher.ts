export function translateCSharpRegex(csharpRegex: string): string {
  let jsRegex = csharpRegex.replace(/^@/, '');

  const namedGroupRegex = /\(\?<(?<name>\w+)>(?<pattern>[^)]+)\)/g;
  jsRegex = jsRegex.replace(namedGroupRegex, (match, name, pattern) => `(${pattern})`);

  return jsRegex.replace(/\\/g, '\\\\');
}

export function regexMatchesPath(path: string, csharpRegex: string): boolean {
  const jsRegex = translateCSharpRegex(csharpRegex);
  const fullPathRegex = jsRegex.startsWith('^') && jsRegex.endsWith('$') ? jsRegex : `^(${jsRegex})$`;

  return new RegExp(fullPathRegex).test(path);
}

export function globMatchesPath(path: string, pattern: string): boolean {
  const regexPattern = pattern.replace(/[\\.+^${}()|[\]*?]/g, (match) => {
    if (match === '*') return '.*';
    if (match === '?') return '.';
    return '\\' + match;
  });

  return new RegExp(`^${regexPattern}$`).test(path);
}

export interface FileTreeFilterTarget {
  path: string;
  resolvedPath: string;
  kind: string;
}

/** Evaluate signed filters in order. Undefined means no rule changed the source selection. */
export function evaluateFileTreeFilters(
  filters: readonly string[],
  target: Readonly<FileTreeFilterTarget>
): boolean | undefined {
  const { path: nodeId, resolvedPath: resolvedNodeId, kind: nodeType } = target;
  for (let i = 0; i < filters.length; i++) {
    const pathPart = filters[i];
    const x = pathPart.slice(1);
    const included = !pathPart.startsWith('-');

    if (isFileTreeFolderPath(x)) {
      // Works - Folder
      if (nodeType !== 'folder') continue;
      const res = nodeId === x || resolvedNodeId == x;

      if (res) {
        return included;
      }
    }

    if (x.startsWith('*') && (x.endsWith(`*\\`) || x.endsWith('*/'))) {
      // Works - FolderNameIncludes
      if (nodeType !== 'folder') continue;
      const trimmedX = x.slice(1, -2);

      if (trimmedX === '') break;

      const res = nodeId?.includes(trimmedX + '\\') || nodeId?.includes(trimmedX + '/');

      if (res) {
        return included;
      }
    }

    if (x.startsWith('[.*') && (x.endsWith(`[^\\/]*]`) || x.endsWith(`[^\\\\]*]`))) {
      // Works - FileNameIncludes
      if (nodeType !== 'file') continue;

      const regexPattern = x.slice(3, -7);
      const regex = new RegExp(regexPattern);
      const res = regex.test(nodeId!);

      if (res) {
        return included;
      }
    }

    if (x.startsWith('[') && x.endsWith(']')) {
      // Works - Regex
      const regexPattern = x.slice(1, -1);
      const res = regexMatchesPath(nodeId!, regexPattern);

      if (res) {
        return included;
      }
    }

    if (x.startsWith('*.')) {
      // Works - File Extension globbing
      if (nodeType !== 'file') continue;
      if (x.replace('*.', '').length === 0) continue;

      const res = globMatchesPath(nodeId!, x);

      if (res) {
        return included;
      }
    }

    // Works - Expression
    if (x === '') continue;

    // Matching file or folder
    if (x === nodeId) {
      return included;
    }

    const res = globMatchesPath(nodeId!, x);

    if (res) {
      return included;
    }
  }

  return undefined;
}

export function isFileTreeFolderPath(path: string): boolean {
  return (
    (path.startsWith('%') && path.endsWith('%') && !path.includes('/') && !path.includes('\\')) ||
    path.endsWith('/') ||
    path.endsWith('\\')
  );
}
