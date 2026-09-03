import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * measure-the-no-ranker-bet spec: "each query fixture declares the entry
 * selector and hop budget a correct retrieval would use, the set of notes a
 * correct retrieval would return, and the vocabulary a reader ... would
 * plausibly search by" — this is the structural half of that requirement.
 * Metric computation itself lives in scripts/eval-retrieval.mjs, run via
 * `npm run eval:retrieval`; this test never imports it, so a new fixture
 * really does "require no change to the evaluation mechanism".
 */
const CORPUS_DIR = path.resolve(import.meta.dirname, '../fixtures/retrieval-corpus');
const QUERIES_DIR = path.join(CORPUS_DIR, 'queries');
const STORE_DIR = path.join(CORPUS_DIR, 'store');

async function readQueryFixtures(): Promise<Array<{ file: string; data: Record<string, unknown> }>> {
  const files = (await readdir(QUERIES_DIR)).filter((f) => f.endsWith('.json'));
  return Promise.all(
    files.map(async (file) => ({ file, data: JSON.parse(await readFile(path.join(QUERIES_DIR, file), 'utf8')) as Record<string, unknown> })),
  );
}

describe('measure-the-no-ranker-bet: the fixture corpus', () => {
  it('every query fixture declares its selector, hop budget, expected set, and vocabulary', async () => {
    const fixtures = await readQueryFixtures();
    expect(fixtures.length).toBeGreaterThan(0);
    for (const { file, data } of fixtures) {
      expect(data.selector, `${file} is missing selector`).toBeTypeOf('object');
      expect(data.hops, `${file} is missing hops`).toBeTypeOf('number');
      expect(Array.isArray(data.expected), `${file} is missing expected`).toBe(true);
      expect((data.expected as unknown[]).length, `${file}'s expected set is empty`).toBeGreaterThan(0);
      expect(Array.isArray(data.vocabulary), `${file} is missing vocabulary`).toBe(true);
    }
  });

  it('spans more than one taxonomy section and more than one link distance', async () => {
    const fixtures = await readQueryFixtures();
    const allExpected = fixtures.flatMap((f) => f.data.expected as string[]);
    const sections = new Set(allExpected.map((p) => p.split('/')[0]));
    expect(sections.size, 'the corpus expects notes from only one section').toBeGreaterThan(1);

    const hopDepths = new Set(fixtures.map((f) => f.data.hops));
    expect(hopDepths.size, 'every fixture uses the same hop budget').toBeGreaterThan(1);
  });

  it('the anti-vacuity condition holds: at least one note lies under an excluded path', async () => {
    const configText = await readFile(path.join(STORE_DIR, 'contexture.yaml'), 'utf8');
    const excludeMatch = /exclude_paths:\s*\[([^\]]*)\]/.exec(configText);
    expect(excludeMatch, 'contexture.yaml has no exclude_paths').not.toBeNull();
    const prefixes = excludeMatch![1]!.split(',').map((s) => s.trim()).filter(Boolean);
    expect(prefixes.length, 'the corpus excludes nothing — the seam gate would have nothing to catch').toBeGreaterThan(0);

    async function walk(dir: string, rel = ''): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const paths: string[] = [];
      for (const entry of entries) {
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) paths.push(...(await walk(path.join(dir, entry.name), relPath)));
        else if (entry.name.endsWith('.md')) paths.push(relPath);
      }
      return paths;
    }
    const allFiles = await walk(STORE_DIR);
    const underExcludedPath = allFiles.filter((p) => prefixes.some((prefix) => p.startsWith(prefix.replace(/\/+$/, '') + '/')));
    expect(underExcludedPath.length, 'no note in the corpus actually lies under an excluded path').toBeGreaterThan(0);
  });

  it('adding a fixture requires no change to the evaluation mechanism: the loader reads the directory, not a fixed list', async () => {
    // A structural guarantee, not a runtime one: scripts/eval-retrieval.mjs
    // globs the queries directory rather than importing named fixture files.
    const script = await readFile(path.resolve(import.meta.dirname, '../../scripts/eval-retrieval.mjs'), 'utf8');
    expect(script).toContain('readdir(QUERIES_DIR)');
    for (const { file } of await readQueryFixtures()) {
      expect(script, `${file} is imported by name, which would need editing per fixture`).not.toContain(file);
    }
  });
});
