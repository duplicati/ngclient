import { describe, expect, it } from 'vitest';
import {
  applyIncludePick,
  buildIncludePickBlock,
  findIncludePick,
  findIncludePickContaining,
  findIncludePicks,
  removeIncludePick,
  remoteSourceFor,
  sourceFolderOf,
  toggleInIncludePick,
} from './include-pick';

const folder = '/home/user/Projects/';

describe('include pick block', () => {
  it('writes includes before the catch-all exclude, with a wildcard rule for picked folders', () => {
    expect(buildIncludePickBlock(folder, [`${folder}ngclient/`, `${folder}notes.md`])).toEqual([
      '+/home/user/Projects/ngclient/*',
      '+/home/user/Projects/notes.md',
      '-/home/user/Projects/*',
    ]);
  });

  it('puts excludes inside picked folders first so they win over the includes', () => {
    expect(buildIncludePickBlock(folder, [`${folder}ngclient/`], [`${folder}ngclient/node_modules/`])).toEqual([
      '-/home/user/Projects/ngclient/node_modules/',
      '+/home/user/Projects/ngclient/*',
      '-/home/user/Projects/*',
    ]);
  });

  it('ignores picks that are not inside the folder', () => {
    expect(buildIncludePickBlock(folder, ['/etc/', folder])).toEqual(['-/home/user/Projects/*']);
  });

  it('works with Windows paths', () => {
    expect(buildIncludePickBlock('C:\\Data\\', ['C:\\Data\\Docs\\', 'C:\\Data\\todo.txt'])).toEqual([
      '+C:\\Data\\Docs\\*',
      '+C:\\Data\\todo.txt',
      '-C:\\Data\\*',
    ]);
  });
});

describe('recognizing a stored pick', () => {
  const paths = [
    '/etc/',
    folder,
    '-{DefaultExcludes}',
    '-/home/user/Projects/ngclient/node_modules/',
    '+/home/user/Projects/ngclient/*',
    '+/home/user/Projects/notes.md',
    '-/home/user/Projects/*',
    '-*.tmp',
  ];

  it('reads the picks and excludes back out of the filters', () => {
    expect(findIncludePick(paths, folder)).toEqual({
      folder,
      picks: ['/home/user/Projects/ngclient/', '/home/user/Projects/notes.md'],
      excludes: ['/home/user/Projects/ngclient/node_modules/'],
      separator: '/',
      start: 3,
      end: 6,
    });
  });

  it('finds no pick for a source without a catch-all exclude', () => {
    expect(findIncludePick(paths, '/etc/')).toBeNull();
    expect(findIncludePick(['/a/', '+/a/b/'], '/a/')).toBeNull();
  });

  it('finds no pick when the folder is not a source', () => {
    expect(findIncludePick(['-/a/*'], '/a/')).toBeNull();
  });

  it('stops the block at the first unrelated filter', () => {
    const edited = [
      folder,
      '+/home/user/Projects/old/',
      '-*.bak',
      '+/home/user/Projects/new.txt',
      '-/home/user/Projects/*',
    ];
    expect(findIncludePick(edited, folder)).toMatchObject({
      picks: ['/home/user/Projects/new.txt'],
      start: 3,
      end: 4,
    });
  });

  it('lists every picked source and finds the innermost pick around a path', () => {
    const nested = ['/a/', '/a/b/', '+/a/b/*', '-/a/*', '+/a/b/c/*', '-/a/b/*'];
    expect(findIncludePicks(nested).map((x) => x.folder)).toEqual(['/a/', '/a/b/']);
    expect(findIncludePickContaining(nested, '/a/b/c/d.txt')?.folder).toBe('/a/b/');
    expect(findIncludePickContaining(nested, '/a/x.txt')?.folder).toBe('/a/');
    expect(findIncludePickContaining(nested, '/a/b/')?.folder).toBe('/a/');
    expect(findIncludePickContaining(nested, '/a/')).toBeNull();
    expect(findIncludePickContaining(nested, '/other/')).toBeNull();
  });
});

describe('applying a pick', () => {
  it('adds the folder as a source before the filters and appends the block', () => {
    expect(applyIncludePick(['/etc/', '-*.tmp'], folder, [`${folder}notes.md`])).toEqual([
      '/etc/',
      folder,
      '-*.tmp',
      '+/home/user/Projects/notes.md',
      '-/home/user/Projects/*',
    ]);
  });

  it('drops sources inside the folder since the pick now covers them', () => {
    expect(applyIncludePick([folder, `${folder}ngclient/`], folder, [`${folder}ngclient/`])).toEqual([
      folder,
      '+/home/user/Projects/ngclient/*',
      '-/home/user/Projects/*',
    ]);
  });

  it('replaces an existing block in place', () => {
    const paths = [folder, '+/home/user/Projects/a/*', '-/home/user/Projects/*', '-*.tmp'];
    expect(applyIncludePick(paths, folder, [`${folder}b.txt`])).toEqual([
      folder,
      '+/home/user/Projects/b.txt',
      '-/home/user/Projects/*',
      '-*.tmp',
    ]);
  });

  it('removes the block when the folder itself is picked', () => {
    const paths = [folder, '+/home/user/Projects/a/*', '-/home/user/Projects/*'];
    expect(applyIncludePick(paths, folder, [folder])).toEqual([folder]);
    expect(removeIncludePick(paths, folder)).toEqual([folder]);
    expect(removeIncludePick(['/etc/'], folder)).toEqual(['/etc/']);
  });
});

describe('toggling entries inside a pick', () => {
  const paths = [folder, '+/home/user/Projects/a/*', '-/home/user/Projects/*'];
  const pick = () => findIncludePick(paths, folder)!;

  it('picks an entry that the catch-all excludes', () => {
    expect(toggleInIncludePick(paths, pick(), `${folder}b.txt`, false)).toEqual([
      folder,
      '+/home/user/Projects/a/*',
      '+/home/user/Projects/b.txt',
      '-/home/user/Projects/*',
    ]);
  });

  it('unpicks a picked entry', () => {
    expect(toggleInIncludePick(paths, pick(), `${folder}a/`, true)).toEqual([folder, '-/home/user/Projects/*']);
  });

  it('excludes an entry that is included through a picked parent, and includes it again on the next toggle', () => {
    const excluded = toggleInIncludePick(paths, pick(), `${folder}a/cache/`, true);
    expect(excluded).toEqual([
      folder,
      '-/home/user/Projects/a/cache/',
      '+/home/user/Projects/a/*',
      '-/home/user/Projects/*',
    ]);
    expect(toggleInIncludePick(excluded, findIncludePick(excluded, folder)!, `${folder}a/cache/`, false)).toEqual(
      paths
    );
  });

  it('picking a folder replaces the picks and excludes below it', () => {
    const deep = [folder, '-/home/user/Projects/a/x/cache/', '+/home/user/Projects/a/x/*', '-/home/user/Projects/*'];
    expect(toggleInIncludePick(deep, findIncludePick(deep, folder)!, `${folder}a/`, false)).toEqual([
      folder,
      '+/home/user/Projects/a/*',
      '-/home/user/Projects/*',
    ]);
  });
});

describe('picks on shortcut tokens', () => {
  const token = '%MY_DOCUMENTS%';

  it('keeps the token and writes the entries in token form', () => {
    expect(buildIncludePickBlock(token, [`${token}/Screenshots/`, `${token}/todo.txt`])).toEqual([
      '+%MY_DOCUMENTS%/Screenshots/*',
      '+%MY_DOCUMENTS%/todo.txt',
      '-%MY_DOCUMENTS%/*',
    ]);
  });

  it('uses the separator of the entries, or the given one when there are none', () => {
    expect(buildIncludePickBlock(token, [`${token}\\Docs\\`], [], '/')).toEqual([
      '+%MY_DOCUMENTS%\\Docs\\*',
      '-%MY_DOCUMENTS%\\*',
    ]);
    expect(buildIncludePickBlock(token, [], [], '\\')).toEqual(['-%MY_DOCUMENTS%\\*']);
  });

  it('reads a token pick back, with either separator', () => {
    const unix = ['/etc/', token, '+%MY_DOCUMENTS%/Screenshots/*', '-%MY_DOCUMENTS%/*'];
    expect(findIncludePick(unix, token)).toEqual({
      folder: token,
      picks: ['%MY_DOCUMENTS%/Screenshots/'],
      excludes: [],
      separator: '/',
      start: 2,
      end: 3,
    });
    expect(findIncludePick([token, '-%MY_DOCUMENTS%\\*'], token)?.separator).toBe('\\');
    expect(findIncludePickContaining(unix, '%MY_DOCUMENTS%/notes.md')?.folder).toBe(token);
    expect(findIncludePickContaining(unix, '/etc/hosts')).toBeNull();
  });

  it('applies and toggles picks under the token', () => {
    const applied = applyIncludePick([token], token, [`${token}/Screenshots/`], [], '/');
    expect(applied).toEqual([token, '+%MY_DOCUMENTS%/Screenshots/*', '-%MY_DOCUMENTS%/*']);

    const pick = findIncludePick(applied, token)!;
    expect(toggleInIncludePick(applied, pick, `${token}/Screenshots/AuthId testing.mp4`, true)).toEqual([
      token,
      '-%MY_DOCUMENTS%/Screenshots/AuthId testing.mp4',
      '+%MY_DOCUMENTS%/Screenshots/*',
      '-%MY_DOCUMENTS%/*',
    ]);
  });
});

describe('picks below sub-folders', () => {
  it('adds a rule for every folder on the way down so the backup can enter it', () => {
    expect(buildIncludePickBlock(folder, [`${folder}docs/plan.md`, `${folder}src/app/core/`])).toEqual([
      '+/home/user/Projects/docs/',
      '+/home/user/Projects/src/',
      '+/home/user/Projects/src/app/',
      '+/home/user/Projects/docs/plan.md',
      '+/home/user/Projects/src/app/core/*',
      '-/home/user/Projects/*',
    ]);
  });

  it('does not add folder rules below a picked folder', () => {
    expect(buildIncludePickBlock(folder, [`${folder}src/`, `${folder}src/app/core/`])).toEqual([
      '+/home/user/Projects/src/*',
      '+/home/user/Projects/src/app/core/*',
      '-/home/user/Projects/*',
    ]);
  });

  it('adds folder rules for shortcut tokens too', () => {
    expect(buildIncludePickBlock('%MY_DOCUMENTS%', ['%MY_DOCUMENTS%/Screenshots/AuthId testing.mp4'])).toEqual([
      '+%MY_DOCUMENTS%/Screenshots/',
      '+%MY_DOCUMENTS%/Screenshots/AuthId testing.mp4',
      '-%MY_DOCUMENTS%/*',
    ]);
  });

  it('reads folder rules as the way down, not as picks', () => {
    const paths = [folder, '+/home/user/Projects/docs/', '+/home/user/Projects/docs/plan.md', '-/home/user/Projects/*'];
    expect(findIncludePick(paths, folder)).toMatchObject({ picks: ['/home/user/Projects/docs/plan.md'], excludes: [] });
  });

  it('turns a folder on the way down into a pick of its own when clicked', () => {
    const paths = [folder, '+/home/user/Projects/docs/', '+/home/user/Projects/docs/plan.md', '-/home/user/Projects/*'];
    expect(toggleInIncludePick(paths, findIncludePick(paths, folder)!, `${folder}docs/`, true)).toEqual([
      folder,
      '+/home/user/Projects/docs/*',
      '-/home/user/Projects/*',
    ]);
  });
});

describe('picks on remote sources', () => {
  const source = '@/dupl-office365-abc|office365://tenant';
  const mount = '/dupl-office365-abc/';

  it('treats the mount folder of a remote source as the pick folder', () => {
    expect(sourceFolderOf(source)).toBe(mount);
    expect(sourceFolderOf('@X:\\dupl-smb-abc|smb://host/share')).toBe('X:\\dupl-smb-abc\\');
    expect(sourceFolderOf('/home/user/')).toBe('/home/user/');
  });

  it('lists a folder on the remote through its source entry, with the sub path appended', () => {
    expect(remoteSourceFor([source], mount)).toBe(source);
    expect(remoteSourceFor([source], `${mount}Users/kenneth/`)).toBe(`${source}|/Users/kenneth/`);
    expect(remoteSourceFor(['/home/user/', source], '/home/user/')).toBeNull();
    expect(remoteSourceFor([`+${mount}Users/*`, source], `${mount}Users/`)).toBe(`${source}|/Users/`);
  });

  it('applies a pick under the mount without adding a second source', () => {
    expect(applyIncludePick([source], mount, [`${mount}Users/kenneth/`])).toEqual([
      source,
      '+/dupl-office365-abc/Users/',
      '+/dupl-office365-abc/Users/kenneth/*',
      '-/dupl-office365-abc/*',
    ]);
  });

  it('reads the pick back for the remote source', () => {
    const paths = [source, '+/dupl-office365-abc/Users/kenneth/*', '-/dupl-office365-abc/*'];
    expect(findIncludePicks(paths).map((x) => x.folder)).toEqual([mount]);
    expect(findIncludePickContaining(paths, `${mount}Users/other/`)?.folder).toBe(mount);
  });
});
