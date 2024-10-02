const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

const newPackageJson = {
  version: packageJson.version,
  name: packageJson.name,
  license: packageJson.license,
  contributors: packageJson.contributors,
};

fs.writeFileSync('./dist/ngclient/browser/package.json', JSON.stringify(newPackageJson, null, 2));

console.log('package.json generated');
