import { afterEach, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';

const { scripts } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const fixtures = new Set<string>();
afterEach(async () => {
  for (const directory of fixtures) {
    if (dirname(directory) !== tmpdir() || !basename(directory).startsWith('ngclient-build-')) {
      throw new Error('Unexpected test fixture path');
    }
    await rm(directory, { recursive: true, force: true });
  }
  fixtures.clear();
});

async function runBuild(name: string, failFont = false) {
  const directory = await mkdtemp(join(tmpdir(), 'ngclient-build-'));
  fixtures.add(directory);
  // Execute the real shell sequence, replacing only the external tools with controlled fixtures.
  await writeFile(
    join(directory, 'package.json'),
    JSON.stringify({
      scripts: {
        [name]: scripts[name].replace(/\bng\b/g, 'bun angular.ts'),
        'gen:font': 'bun font.ts',
      },
    })
  );
  await writeFile(
    join(directory, 'font.ts'),
    `
    await Bun.sleep(150);
    if (process.env.FONT_FAILURE === 'true') process.exit(23);
    await Bun.write('font-ready', 'generated');
  `
  );
  await writeFile(
    join(directory, 'angular.ts'),
    `
    if (!await Bun.file('font-ready').exists()) process.exit(42);
    await Bun.write('angular-args.json', JSON.stringify(process.argv.slice(2)));
  `
  );
  const process = Bun.spawn([Bun.which('bun')!, 'run', name, '--no-progress'], {
    cwd: directory,
    env: { ...Bun.env, FONT_FAILURE: String(failFont) },
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    process.exited,
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
  ]);
  const angularArgs = await readFile(join(directory, 'angular-args.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  return { exitCode, angularArgs, output: stdout + stderr };
}

for (const [name, args] of Object.entries({
  build: ['build'],
  'build:dev': ['build', 'ngclient', '--configuration', 'development'],
  'build:prod': ['build', 'ngclient', '--configuration', 'production'],
})) {
  test(name + ' waits for generated fonts and forwards Angular arguments', async () => {
    const result = await runBuild(name);
    expect(result.exitCode, result.output).toBe(0);
    expect(result.angularArgs).toEqual([...args, '--no-progress']);
  });
  test(name + ' stops when font generation fails', async () => {
    const result = await runBuild(name, true);
    expect(result.exitCode, result.output).toBe(23);
    expect(result.angularArgs).toBeNull();
  });
}
