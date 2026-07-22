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
