import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OPENROUTER_FAMILY_MODELS } from '../../src/config/defaults.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';
// @ts-expect-error a plain script with no declaration file
import { missingSlugs, shippedSlugs } from '../../scripts/check-openrouter-models.mjs';

/**
 * ship-default-openrouter-models, harness-portability requirement "A
 * scheduled check reports a shipped slug that OpenRouter no longer lists".
 * The script itself reaches the network only when given no list file, and
 * nothing here runs it that way.
 */
const ROOT = path.resolve(import.meta.dirname, '../..');
const SCRIPT = path.join(ROOT, 'scripts', 'check-openrouter-models.mjs');
const TABLE = Object.entries(OPENROUTER_FAMILY_MODELS).flatMap(([family, tiers]) => Object.entries(tiers).map(([tier, slug]) => ({ family, tier, slug })));

let tmp: TmpDir;
beforeEach(async () => {
  tmp = await makeTmpDir('check-openrouter-models-');
});
afterEach(() => tmp.cleanup());

function runWith(ids: string[]): { status: number | null; stdout: string } {
  const listFile = path.join(tmp.root, 'models.json');
  writeFileSync(listFile, JSON.stringify({ data: ids.map((id) => ({ id })) }));
  const r = spawnSync(process.execPath, [SCRIPT, '--list-file', listFile], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout };
}

describe('the scheduled check of shipped OpenRouter slugs', () => {
  it('reads from the source file the same table the package ships', () => {
    expect(shippedSlugs(readFileSync(path.join(ROOT, 'src', 'config', 'defaults.ts'), 'utf8'))).toEqual(TABLE);
  });

  it('exits 0 when the list holds every shipped slug', () => {
    const r = runWith([...TABLE.map((row) => row.slug), 'vendor/other']);
    expect(r).toMatchObject({ status: 0 });
    expect(r.stdout).toContain(`all ${TABLE.length} shipped OpenRouter slugs are listed`);
  });

  it('exits 1 naming a missing slug with its family and tier', () => {
    const gone = TABLE.find((row) => row.family === 'gemini' && row.tier === 'strong')!;
    const r = runWith(TABLE.map((row) => row.slug).filter((slug) => slug !== gone.slug));
    expect(r.status).toBe(1);
    expect(r.stdout.trim()).toBe(`MISSING ${gone.slug} (gemini, strong)`);
  });

  it('exits 2 when the list cannot be read, and names no slug as missing', () => {
    const listFile = path.join(tmp.root, 'models.json');
    writeFileSync(listFile, '{"unexpected": true}');
    const r = spawnSync(process.execPath, [SCRIPT, '--list-file', listFile], { encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    expect(missingSlugs(TABLE, { data: [] })).toEqual(TABLE);
  });

  it('sends no key and no header of its own', () => {
    const script = readFileSync(SCRIPT, 'utf8');
    expect(script).not.toMatch(/OPENROUTER_API_KEY|Authorization|Referer|X-Title/i);
  });
});
