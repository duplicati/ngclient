import { XMLParser } from 'fast-xml-parser';
import fs from 'fs';
import path from 'path';

const localeDir = 'src/locale';
const files = fs.readdirSync(localeDir).filter(f => f.endsWith('.xlf'));

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '',
});

files.forEach(file => {
  const content = fs.readFileSync(path.join(localeDir, file), 'utf-8');
  const parsed = parser.parse(content);

  const units = parsed['xliff']['file']['body']['trans-unit'];
  const translations: Record<string, string> = {};

  for (const unit of Array.isArray(units) ? units : [units]) {
    if (unit.id && unit.target) {
      translations[unit.id] = typeof unit.target === 'string' ? unit.target : unit.target['#text'];
    }
  }

  const outFile = path.join(localeDir, file.replace(/\.xlf$/, '.json'));
  fs.writeFileSync(outFile, JSON.stringify({ translations }, null, 2));
  console.log(`✅ Wrote ${outFile}`);
});