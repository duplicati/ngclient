import packageJson from '../package.json';

// @ts-ignore
import { write } from 'bun';

const newPackageJson = {
  name: packageJson.name,
  version: packageJson.version,
  license: packageJson.license,
  contributors: packageJson.contributors,
  repository: packageJson.repository,
  bugs: packageJson.bugs,
  homepage: packageJson.homepage,
};

await write('./dist/ngclient/browser/package.json', JSON.stringify(newPackageJson, null, 2));

console.log('package.json generated with repository metadata');
