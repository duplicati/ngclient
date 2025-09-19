import packageJson from '../package.json';

// @ts-ignore
import { write } from 'bun';

const newPackageJson = {
  version: packageJson.version,
  name: packageJson.name,
  license: packageJson.license,
  contributors: packageJson.contributors,
};

await write('./dist/ngclient/browser/package.json', JSON.stringify(newPackageJson, null, 2));

console.log('package.json generated');
