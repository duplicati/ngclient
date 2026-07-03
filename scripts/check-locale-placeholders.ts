import * as fs from 'fs';
import * as path from 'path';
import { parseStringPromise } from 'xml2js';

/**
 * Validates that every translation unit's placeholder structure matches the
 * English source. A mismatch (e.g. a dropped START_TAG_STRONG while keeping
 * its CLOSE_TAG_STRONG) breaks Angular's i18n runtime at render time with an
 * opaque "Cannot read properties of undefined (reading 'push')" error.
 *
 * Exits with code 1 (and prints a visible warning) when any locale has a
 * mismatched placeholder, so it can fail CI / tx:sync loudly.
 */

const LOCALE_DIR = path.resolve('projects/ngclient/src/locale');

// Placeholder families that must balance between source and target.
//  - TAG_* / BLOCK_* come in START_/CLOSE_ pairs
//  - the rest are standalone tokens counted directly
const PAIRED_PREFIXES = ['TAG_', 'BLOCK_'];
const STANDALONE_TOKENS = ['INTERPOLATION', 'ICU'];

type Unit = {
  id: string;
  source: string | null;
  target: string | null;
};

function flattenText(node: any): string {
  // Reconstruct a normalized string of placeholder tokens + text from an
  // xml2js-parsed <source>/<target> node tree, mirroring convert-xlf-to-json.
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object') {
    if (node.$?.id) {
      // <x id="..."/> or <g id="...">...</g> -> emit the id token
      return ` ${node.$.id} `;
    }
    let out = '';
    for (const key of Object.keys(node)) {
      if (key === '$' || key === '_') {
        out += flattenText(node[key]);
      } else {
        out += flattenText(node[key]);
      }
    }
    return out;
  }
  return '';
}

async function parseUnits(filePath: string): Promise<Unit[]> {
  const xml = fs.readFileSync(filePath, 'utf8');
  const parsed = await parseStringPromise(xml, {
    explicitChildren: true,
    preserveChildrenOrder: true,
    charsAsChildren: true,
  });
  const units: any[] = parsed?.xliff?.file?.[0]?.body?.[0]?.['trans-unit'] ?? [];
  return units.map((u) => {
    const id = u.$.id;
    const src = u.source?.[0];
    const tgt = u.target?.[0];
    return {
      id,
      source: src ? flattenText(src) : null,
      target: tgt ? flattenText(tgt) : null,
    };
  });
}

function tokenCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  // Match every placeholder token, e.g. START_TAG_STRONG, CLOSE_BLOCK_IF,
  // INTERPOLATION, ICU, ...
  const re = /\b(START_[A-Z_]+|CLOSE_[A-Z_]+|[A-Z][A-Z_]+)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const tok = m[1];
    // Normalize anything that isn't a START_/CLOSE_ pair or a known
    // standalone token to its base name so stray all-caps words in text
    // don't pollute counts. We only track tokens that look like real i18n
    // placeholders (START_/CLOSE_ prefix or a recognized standalone).
    if (tok.startsWith('START_') || tok.startsWith('CLOSE_')) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    } else if (STANDALONE_TOKENS.includes(tok)) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
  }
  return counts;
}

function mismatchFor(
  source: string,
  target: string
): { token: string; sourceCount: number; targetCount: number } | null {
  const sCounts = tokenCounts(source);
  const tCounts = tokenCounts(target);
  const tokens = new Set([...sCounts.keys(), ...tCounts.keys()]);
  for (const tok of tokens) {
    const s = sCounts.get(tok) ?? 0;
    const t = tCounts.get(tok) ?? 0;
    if (s !== t) {
      return { token: tok, sourceCount: s, targetCount: t };
    }
  }
  return null;
}

async function checkLocale(
  enUnits: Map<string, Unit>,
  filePath: string
): Promise<string[]> {
  const lang = path.basename(filePath).replace(/^messages\./, '').replace(/\.xlf$/, '');
  const units = await parseUnits(filePath);
  const problems: string[] = [];

  for (const u of units) {
    const en = enUnits.get(u.id);
    if (!en || !en.source || !u.target) continue; // skip unknown / untranslated
    const bad = mismatchFor(en.source, u.target);
    if (bad) {
      problems.push(
        `  [${lang}] trans-unit ${u.id}: placeholder "${bad.token}" ` +
          `count differs (source=${bad.sourceCount}, target=${bad.targetCount})`
      );
    }
  }
  return problems;
}

async function run() {
  const enPath = path.join(LOCALE_DIR, 'messages.en.xlf');
  if (!fs.existsSync(enPath)) {
    console.error('Locale check: messages.en.xlf not found — skipping.');
    return;
  }

  const enUnitsArr = await parseUnits(enPath);
  const enUnits = new Map(enUnitsArr.map((u) => [u.id, u]));

  const files = fs
    .readdirSync(LOCALE_DIR)
    .filter(
      (f) => f.startsWith('messages.') && f.endsWith('.xlf') &&
        f !== 'messages.en.xlf' && f !== 'messages.xlf'
    )
    .map((f) => path.join(LOCALE_DIR, f));

  let totalProblems: string[] = [];
  for (const f of files) {
    try {
      totalProblems = totalProblems.concat(await checkLocale(enUnits, f));
    } catch (err) {
      totalProblems.push(
        `  [${path.basename(f)}] failed to parse: ${(err as Error).message}`
      );
    }
  }

  if (totalProblems.length > 0) {
    console.warn('');
    console.warn('⚠️  Locale placeholder mismatch detected!');
    console.warn('   Translation placeholders do not match the English source.');
    console.warn('   This typically causes a runtime i18n error:');
    console.warn('   "Cannot read properties of undefined (reading \'push\')".');
    console.warn('   Fix the listed <target> entries in the .xlf files before shipping.');
    console.warn('');
    for (const p of totalProblems) console.warn(p);
    console.warn('');
    process.exitCode = 1;
  } else {
    console.log('✔️  Locale placeholder check passed for all languages.');
  }
}

run().catch((err) => {
  console.error('❌ Locale check error:', err);
  process.exitCode = 1;
});
