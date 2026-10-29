import { expect, test } from 'bun:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { LOCALE_CATALOG } from './locale-catalog';
import { buildLocaleArtifacts, generateLocales, verifyLocaleAssets } from './generate-locales';
import contract from '../projects/ngclient/src/app/core/locales/testing/locale-contract.json';
import original from '../projects/ngclient/src/app/core/locales/testing/angular-locales.json';
import {
  DEFAULT_LOCALE,
  LANGUAGES,
  LOCALE_MAP,
  ANGULAR_MJS_LOCALE_MAP,
} from '../projects/ngclient/src/app/core/locales/locale-definitions';

const root = fileURLToPath(new URL('../', import.meta.url));
const configuration = JSON.parse(await readFile(new URL('../angular.json', import.meta.url), 'utf8'));
const filesFor = (asset: { input: string; output: string; glob: string }) => {
  const match = asset.glob.match(/^(.*)\{([^}]+)\}(.*)$/);
  return (match ? match[2].split(',').map((name) => match[1] + name + match[3]) : [asset.glob]).map((name) =>
    [asset.input, asset.output, name].join('|')
  );
};
test('generated public definitions preserve the frozen runtime contract', () => {
  expect(DEFAULT_LOCALE).toBe(contract.defaultLocale);
  expect(LANGUAGES).toEqual(contract.languages);
  expect(LOCALE_MAP).toEqual(Object.fromEntries(contract.cases.map((c) => [c.input, c.mapped])));
  expect(ANGULAR_MJS_LOCALE_MAP).toEqual(contract.mjs);
});
test('generated Angular locales preserve every source, XLF and base href', () => {
  const result = buildLocaleArtifacts(configuration);
  expect(result.config.projects.ngclient.i18n).toEqual(original.i18n);
});
test('generated asset patterns copy exactly the same JSON and Day.js files', () => {
  const result = buildLocaleArtifacts(configuration);
  const assets = result.config.projects.ngclient.architect.build.options.assets.filter((a: any) =>
    a.input?.includes('/locale')
  );
  expect(assets.flatMap(filesFor).sort()).toEqual(original.assets.flatMap(filesFor).sort());
  expect(
    result.config.projects.ngclient.architect.build.options.assets.filter((a: any) => !a.input?.includes('/locale'))
  ).toEqual(
    configuration.projects.ngclient.architect.build.options.assets.filter((a: any) => !a.input?.includes('/locale'))
  );
});
test('all catalog translations and imported locale modules exist', async () => {
  const result = buildLocaleArtifacts(configuration);
  await verifyLocaleAssets(root, result.config);
});
test('generation is deterministic and leaves unrelated Angular settings unchanged', () => {
  const first = buildLocaleArtifacts(configuration);
  const second = buildLocaleArtifacts(first.config);
  expect(second).toEqual(first);
  const { i18n, architect, ...other } = first.config.projects.ngclient;
  const { i18n: oldI18n, architect: oldArchitect, ...oldOther } = configuration.projects.ngclient;
  expect(other).toEqual(oldOther);
  expect(architect.test).toEqual(oldArchitect.test);
  expect(architect.serve).toEqual(oldArchitect.serve);
  expect(architect.build.configurations).toEqual(oldArchitect.build.configurations);
});
test('rejects duplicate codes and aliases', () => {
  expect(() => buildLocaleArtifacts(configuration, [...LOCALE_CATALOG, LOCALE_CATALOG[0]])).toThrow(
    'Duplicate locale code'
  );
  const invalid = LOCALE_CATALOG.map((entry, index) => (index ? entry : { ...entry, aliases: ['en-US'] }));
  expect(() => buildLocaleArtifacts(configuration, invalid)).toThrow('Duplicate locale alias');
});
test('rejects unknown runtime targets and conflicting Angular registrations', () => {
  const invalid = LOCALE_CATALOG.map((entry, index) => (index ? entry : { ...entry, runtime: 'missing' }));
  expect(() => buildLocaleArtifacts(configuration, invalid)).toThrow('Unknown runtime locale');
  const conflicting = LOCALE_CATALOG.map((entry, index) =>
    index !== 1 ? entry : { ...entry, angular: { data: 'fr', alias: 'en' } }
  );
  expect(() => buildLocaleArtifacts(configuration, conflicting)).toThrow('Conflicting locale data');
});
test('reports missing translation files and missing Day.js modules', async () => {
  const missing = LOCALE_CATALOG.map((entry, index) => (index ? entry : { ...entry, file: 'missing' }));
  await expect(
    verifyLocaleAssets(root, buildLocaleArtifacts(configuration, missing).config, missing)
  ).rejects.toThrow();
  const missingModule = LOCALE_CATALOG.map((entry, index) =>
    index ? entry : { ...entry, dayjs: { data: 'missing' } }
  );
  await expect(
    verifyLocaleAssets(root, buildLocaleArtifacts(configuration, missingModule).config, missingModule)
  ).rejects.toThrow();
});
test('checked-in files match generation', async () => {
  await generateLocales(true);
});
