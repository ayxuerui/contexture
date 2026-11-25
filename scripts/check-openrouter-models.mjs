#!/usr/bin/env node
// ship-default-openrouter-models D6: reports each shipped OpenRouter slug that
// OpenRouter's public model list no longer holds. Run weekly by
// .github/workflows/openrouter-models-check.yml, never by `npm test`.
//
// Node builtins only, and the table is read from the TypeScript source by
// pattern, so the check needs no install and no build: a watchdog should not
// depend on the tree it watches. test/unit/check-openrouter-models.test.ts
// fails when that pattern stops matching the real table.
//
// The request carries no key and no header naming the caller.
//
// Exit codes: 0 every slug is listed; 1 at least one is missing; 2 the answer
// could not be determined (the table or the list could not be read).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULTS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src', 'config', 'defaults.ts');
const MODELS_URL = 'https://openrouter.ai/api/v1/models';

/** The shipped table as `[{ family, tier, slug }]`, from the source text of `defaults.ts`. */
export function shippedSlugs(sourceText) {
  const table = /export const OPENROUTER_FAMILY_MODELS = \{([\s\S]*?)\n\} as const/.exec(sourceText)?.[1];
  if (table === undefined) throw new Error('OPENROUTER_FAMILY_MODELS was not found in src/config/defaults.ts');
  const rows = [];
  for (const line of table.matchAll(/^\s*([a-z]+): \{([^}]*)\},?\s*$/gm)) {
    for (const cell of line[2].matchAll(/([a-z]+): '([^']+)'/g)) rows.push({ family: line[1], tier: cell[1], slug: cell[2] });
  }
  if (rows.length === 0) throw new Error('OPENROUTER_FAMILY_MODELS holds no slug this script can read');
  return rows;
}

/** The rows whose slug the list does not hold. `list` is OpenRouter's response body, parsed. */
export function missingSlugs(rows, list) {
  if (!Array.isArray(list?.data)) throw new Error('the model list has no data array');
  const listed = new Set(list.data.map((model) => model.id));
  return rows.filter((row) => !listed.has(row.slug));
}

async function main(argv) {
  const fileFlag = argv.indexOf('--list-file');
  const listFile = fileFlag >= 0 ? argv[fileFlag + 1] : null;
  let rows;
  let list;
  try {
    rows = shippedSlugs(readFileSync(DEFAULTS_FILE, 'utf8'));
    if (listFile) {
      list = JSON.parse(readFileSync(listFile, 'utf8'));
    } else {
      const response = await fetch(MODELS_URL, { signal: AbortSignal.timeout(60_000) });
      if (!response.ok) throw new Error(`${MODELS_URL} answered ${response.status}`);
      list = await response.json();
    }
    const missing = missingSlugs(rows, list);
    if (missing.length === 0) {
      console.log(`all ${rows.length} shipped OpenRouter slugs are listed`);
      return 0;
    }
    for (const row of missing) console.log(`MISSING ${row.slug} (${row.family}, ${row.tier})`);
    return 1;
  } catch (error) {
    console.error(`could not check the shipped OpenRouter slugs: ${error instanceof Error ? error.message : String(error)}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main(process.argv.slice(2));
