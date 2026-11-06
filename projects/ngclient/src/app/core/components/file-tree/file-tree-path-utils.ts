/** A path names a folder when it ends with a separator, or is a bare %SHORTCUT% token. */
export const isFolderPath = (path: string): boolean =>
  (path.startsWith('%') && path.endsWith('%') && !path.includes('/') && !path.includes('\\')) ||
  path.endsWith('/') ||
  path.endsWith('\\');
