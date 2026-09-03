#!/usr/bin/env node
// measure-the-no-ranker-bet spec: the committed vehicle for the
// retrieval-quality capability. Not a `ctxr` command (design.md D1) — a
// store-facing version would ship this fixture corpus into every store, and
// a per-store version needs a gold set no operator will write. Imports the
// BUILT library (`dist/`, produced by `npm run build`) rather than `src/`,
// so it exercises exactly what a consumer of the package would get.
//
// Computes, over `test/fixtures/retrieval-corpus/`:
//   - enumeration-seam respect  (gates at zero, never baselined)
//   - reachability              (baselined; a leg found every expected note)
//   - gloss vocabulary coverage (baselined; three states, never summed)
// and compares the last two against the committed baseline at
// `test/fixtures/retrieval-corpus/baseline.json`.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const CORPUS_DIR = path.join(ROOT, 'test/fixtures/retrieval-corpus');
const STORE_DIR = path.join(CORPUS_DIR, 'store');
const QUERIES_DIR = path.join(CORPUS_DIR, 'queries');
const BASELINE_PATH = path.join(CORPUS_DIR, 'baseline.json');

const { readConfig } = await import(path.join(ROOT, 'dist/config/load.js'));
const { listNotes } = await import(path.join(ROOT, 'dist/core/notes/list.js'));
const { buildGraphFromNotes, graphBuildOptions } = await import(path.join(ROOT, 'dist/core/graph/model.js'));
const { catalogSectionsFor, sectionForNote } = await import(path.join(ROOT, 'dist/core/catalog/model.js'));
const { gather } = await import(path.join(ROOT, 'dist/core/retrieval/pass.js'));

// --- test-only fault injection, off by default (task 3.3's negative controls) ---
const INJECT_LEAK_LEG = process.env.EVAL_RETRIEVAL_INJECT_LEAK_LEG === '1';
const INJECT_SOURCE_VIOLATION = process.env.EVAL_RETRIEVAL_INJECT_SOURCE_VIOLATION === '1';

async function loadCorpus() {
  const config = await readConfig(STORE_DIR);
  const notes = await listNotes(STORE_DIR, config);
  const graph = buildGraphFromNotes(notes, graphBuildOptions(config));
  const store = { root: STORE_DIR, config };
  const queryFiles = (await readdir(QUERIES_DIR)).filter((f) => f.endsWith('.json')).sort();
  const fixtures = await Promise.all(queryFiles.map(async (f) => JSON.parse(await readFile(path.join(QUERIES_DIR, f), 'utf8'))));
  return { store, notes, graph, fixtures };
}

// --- Legs: each returns the note paths it surfaces for one fixture. ---
function catalogLeg(store, fixture) {
  if (!fixture.selector.sections) return null;
  const sections = catalogSectionsFor(store.config);
  const wanted = new Set(fixture.selector.sections);
  return store.notes.filter((n) => wanted.has(sectionForNote(sections, n.path).id)).map((n) => n.path);
}

async function passLeg(store, notes, graph, fixture) {
  const out = await gather(store, notes, graph, {
    seeds: fixture.selector.seeds,
    sections: fixture.selector.sections,
    under: fixture.selector.under,
    entities: fixture.selector.entities,
    hops: fixture.hops,
  });
  return out.notes.map((n) => n.path);
}

function legs(store, notes, graph) {
  const registered = [
    { name: 'catalog', run: (fixture) => catalogLeg({ ...store, notes }, fixture) },
    { name: 'context-gather', run: (fixture) => passLeg(store, notes, graph, fixture) },
  ];
  if (INJECT_LEAK_LEG) {
    // A synthetic leg that reads a note the store's enumeration excludes —
    // exists only to prove the gate actually catches a bypass.
    registered.push({ name: 'synthetic-leak-leg', run: () => ['secret/hidden.md'] });
  }
  return registered;
}

// --- Metric 1: enumeration-seam respect (runtime half) ---
async function checkSeamRespect(store, notes, graph, fixtures) {
  const admitted = new Set(notes.map((n) => n.path));
  const offenses = [];
  for (const leg of legs(store, notes, graph)) {
    for (const fixture of fixtures.length > 0 ? fixtures : [{ id: '(no fixtures)', selector: {}, hops: 0 }]) {
      const returned = (await leg.run(fixture)) ?? [];
      for (const notePath of returned) {
        if (!admitted.has(notePath)) offenses.push({ note: notePath, leg: leg.name, fixture: fixture.id });
      }
    }
  }
  return offenses;
}

// --- Metric 1b: enumeration-seam respect (source half, independent of the corpus) ---
//
// The invariant: `excludePrefixes` — the parameter name threading the store's
// exclusion configuration through a recursive directory walk — is declared in
// exactly one file. A second module reimplementing exclusion-aware directory
// recursion (the realistic shape of a competing enumeration) is caught here,
// before any fixture exercises it. A module that reads `.md` files with NO
// exclusion-awareness at all is a cruder bypass the RUNTIME half already
// catches, since it would trivially surface `secret/hidden.md`.
async function checkSourceSeam() {
  const SRC_DIR = path.join(ROOT, 'src');
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.name.endsWith('.ts')) files.push(full);
    }
  }
  await walk(SRC_DIR);

  const contents = new Map();
  for (const f of files) contents.set(path.relative(SRC_DIR, f).split(path.sep).join('/'), await readFile(f, 'utf8'));
  if (INJECT_SOURCE_VIOLATION) {
    contents.set('core/retrieval/rogue-leg.ts', 'function walk(dir, root, excludePrefixes) { readdir(dir); }');
  }

  const ALLOWED_WALKER = 'core/notes/list.ts';
  const violations = [];
  for (const [file, text] of contents) {
    if (file === ALLOWED_WALKER) continue;
    if (/\bexcludePrefixes\b/.test(text)) {
      violations.push({ module: file, reason: 'declares an excludePrefixes-threaded walk outside core/notes/list.ts' });
    }
  }
  return violations;
}

// --- Metric 2: reachability ---
async function checkReachability(store, notes, graph, fixtures) {
  const misses = [];
  for (const fixture of fixtures) {
    const returned = new Set(await passLeg(store, notes, graph, fixture));
    for (const expected of fixture.expected) {
      if (!returned.has(expected)) misses.push({ fixture: fixture.id, note: expected });
    }
  }
  return { missRate: fixtures.length > 0 ? misses.length / fixtures.reduce((n, f) => n + f.expected.length, 0) : 0, misses };
}

// --- Metric 3: gloss vocabulary coverage, three states, never summed ---
function noteBodyAndGloss(store, notes, notePath) {
  const note = notes.find((n) => n.path === notePath);
  const sections = catalogSectionsFor(store.config);
  return { body: note?.body ?? '', section: note ? sectionForNote(sections, note.path).id : null };
}

async function checkGlossVocabularyCoverage(store, notes, fixtures) {
  const glossOf = new Map();
  {
    // Read every catalog section file directly — the pass's own gloss join,
    // duplicated in miniature so this metric doesn't depend on the pass leg.
    const { readCatalogGlosses } = await import(path.join(ROOT, 'dist/core/records.js'));
    for (const [notePath, gloss] of await readCatalogGlosses(store)) glossOf.set(notePath, gloss);
  }

  const buckets = { gloss: [], bodyOnly: [], neither: [] };
  const seen = new Set();
  for (const fixture of fixtures) {
    if (!fixture.vocabulary || fixture.vocabulary.length === 0) continue;
    const terms = fixture.vocabulary.map((t) => t.toLowerCase());
    const hasTerm = (text) => terms.some((t) => text.toLowerCase().includes(t));
    for (const notePath of fixture.expected) {
      const key = `${fixture.id}::${notePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const gloss = glossOf.get(notePath) ?? '';
      if (hasTerm(gloss)) {
        buckets.gloss.push(notePath);
        continue;
      }
      const { body } = noteBodyAndGloss(store, notes, notePath);
      if (hasTerm(body)) buckets.bodyOnly.push(notePath);
      else buckets.neither.push(notePath);
    }
  }
  return buckets;
}

// --- Baseline: committed, byte-stable, timestamp-free, diff-readable ---
function stableStringify(value) {
  const sortKeys = (v) => {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
    }
    return v;
  };
  return JSON.stringify(sortKeys(value), null, 2) + '\n';
}

async function readBaseline() {
  try {
    return JSON.parse(await readFile(BASELINE_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

function compareToBaseline(current, baseline) {
  if (!baseline) return { regressions: [], isFirstRun: true };
  const regressions = [];
  if (current.reachabilityMissRate > baseline.reachabilityMissRate) {
    regressions.push(`reachabilityMissRate: baseline ${baseline.reachabilityMissRate}, now ${current.reachabilityMissRate}`);
  }
  if (current.glossCoverage.gloss < baseline.glossCoverage.gloss) {
    regressions.push(`glossCoverage.gloss: baseline ${baseline.glossCoverage.gloss}, now ${current.glossCoverage.gloss}`);
  }
  if (current.glossCoverage.neither > baseline.glossCoverage.neither) {
    regressions.push(`glossCoverage.neither: baseline ${baseline.glossCoverage.neither}, now ${current.glossCoverage.neither}`);
  }
  return { regressions, isFirstRun: false };
}

async function main() {
  const { store, notes, graph, fixtures } = await loadCorpus();

  const seamOffenses = await checkSeamRespect(store, notes, graph, fixtures);
  const sourceViolations = await checkSourceSeam();

  const reachability = await checkReachability(store, notes, graph, fixtures);
  const glossBuckets = await checkGlossVocabularyCoverage(store, notes, fixtures);
  const glossCoverage = {
    gloss: glossBuckets.gloss.length,
    bodyOnly: glossBuckets.bodyOnly.length,
    neither: glossBuckets.neither.length,
    total: glossBuckets.gloss.length + glossBuckets.bodyOnly.length + glossBuckets.neither.length,
  };

  const current = { reachabilityMissRate: reachability.missRate, glossCoverage };

  console.log('Retrieval quality evaluation');
  console.log('=============================');
  console.log('');
  console.log(`Enumeration-seam respect: ${seamOffenses.length} escaped note(s), ${sourceViolations.length} source violation(s) [gate — never baselined]`);
  for (const o of seamOffenses) console.log(`  - "${o.note}" returned by leg "${o.leg}" for fixture "${o.fixture}"`);
  for (const v of sourceViolations) console.log(`  - module "${v.module}": ${v.reason}`);
  console.log('');
  console.log(`Reachability: ${reachability.misses.length} miss(es), rate ${reachability.missRate.toFixed(4)}`);
  for (const m of reachability.misses) console.log(`  - "${m.note}" expected by fixture "${m.fixture}" was not returned`);
  console.log('');
  console.log(`Gloss vocabulary coverage (of ${glossCoverage.total} expected note(s) across fixtures with a declared vocabulary):`);
  console.log(`  gloss carries it:    ${glossCoverage.gloss}`);
  console.log(`  body only carries it: ${glossCoverage.bodyOnly}  (${glossBuckets.bodyOnly.join(', ') || '—'})`);
  console.log(`  neither carries it:   ${glossCoverage.neither}  (${glossBuckets.neither.join(', ') || '—'})`);
  console.log('');

  const baseline = await readBaseline();
  const { regressions, isFirstRun } = compareToBaseline(current, baseline);
  if (isFirstRun) {
    console.log('No committed baseline yet — this run establishes one candidate. Commit it deliberately.');
  } else if (regressions.length === 0) {
    const improved = current.reachabilityMissRate < baseline.reachabilityMissRate || current.glossCoverage.gloss > baseline.glossCoverage.gloss;
    console.log(improved ? 'Improved over the committed baseline. The baseline file is left unchanged — update it deliberately.' : 'Matches the committed baseline.');
  }

  // --- Write the candidate for a human to diff and commit; never overwrite silently. ---
  const candidatePath = BASELINE_PATH + '.candidate';
  await (await import('node:fs/promises')).writeFile(candidatePath, stableStringify(current));
  console.log(`Candidate baseline written to ${path.relative(ROOT, candidatePath)}.`);

  const gateFailed = seamOffenses.length > 0 || sourceViolations.length > 0;
  if (gateFailed) {
    console.error('');
    console.error('FAIL: enumeration-seam respect is non-zero. This never has an acceptable baseline.');
    process.exitCode = 1;
    return;
  }
  if (regressions.length > 0) {
    console.error('');
    console.error('FAIL: regression against the committed baseline:');
    for (const r of regressions) console.error(`  - ${r}`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = 0;
}

await main();
