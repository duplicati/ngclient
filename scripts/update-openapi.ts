const SWAGGER_URL = 'http://localhost:8200/swagger/v1/swagger.json';
const OUTPUT_FILE = './swagger.json';

// @ts-ignore
import { write } from 'bun';

const response = await fetch(SWAGGER_URL);

if (!response.ok) {
  throw new Error(`Failed to fetch ${SWAGGER_URL}: ${response.status} ${response.statusText}`);
}

const text = await response.text();
const replaced = text.replaceAll('Duplicati.GUI.TrayIcon', 'Duplicati.Server');
const updated = replaced.endsWith('\n') ? replaced : replaced + '\n';
const replacements = (text.match(/Duplicati\.GUI\.TrayIcon/g) ?? []).length;

await write(OUTPUT_FILE, updated);

console.log(`swagger.json updated (${replacements} tag replacements)`);
