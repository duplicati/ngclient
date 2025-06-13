import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';

function extractTextFromTarget(target: any): string {
    if (!target || !Array.isArray(target.$$)) return '';

    return target.$$.map((node: any) => {
        if (node['#name'] === 'x') {
            const id = node.$?.id;
            return id ? `{$${id}}` : '';
        }
        if (node['#name'] === 'g') {
            const id = node.$?.id;
            const inner = extractTextFromTarget(node);
            return `{$${id}}${inner}{$CLOSE_${id}}`;
        }
        if ('_' in node) {
            return node._;
        }
        return '';
    }).join('').trim();
}

async function convertFile(inputPath: string, outputPath: string) {
  const xml = fs.readFileSync(inputPath, 'utf8');
  const parsed = await parseStringPromise(xml, {
      preserveChildrenOrder: true,
      explicitChildren: true,
      charsAsChildren: true
  });

  const result: Record<string, string> = {};
  const units = parsed.xliff.file[0].body[0]['trans-unit'];

  for (const unit of units) {
      const id = unit.$.id;
      const target = unit.target?.[0];

      const content = extractTextFromTarget(target);

      if (!content || content.trim() === '') {
          // Skip untranslated strings
          continue;
      }

      result[id] = content;
  }

  fs.writeFileSync(outputPath, JSON.stringify({ translations: result }, null, 2), 'utf8');
  console.log(`✔️ Converted ${path.basename(inputPath)} → ${path.basename(outputPath)}`);
}

async function run() {
    const folder = path.resolve('src/locale');
    const files = fs.readdirSync(folder).filter(f => f.endsWith('.xlf'));

    for (const file of files) {
        const inputPath = path.join(folder, file);
        const outputPath = path.join(folder, file.replace(/\.xlf$/, '.json'));
        await convertFile(inputPath, outputPath);
    }
}

run().catch(err => {
    console.error('❌ Conversion error:', err);
});