import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig, TaxonomyLayerConfig } from '../config/schema.js';
import { scanDocsDir, SKILL_FILE_NAME, type ScannedDoc } from './conventions.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';
import { writeFileAtomic } from './fs/atomic.js';
import { packagedTemplate } from './templates.js';

/**
 * The canonical skill bodies live as plain markdown under
 * `templates/skills/` — see `templates.ts` for why they are loaded
 * synchronously and cached.
 */
function skillTemplate(slug: string): string {
  return packagedTemplate('skills', slug);
}

/**
 * harness-portability spec (task 8.6, revised by entry-doc-generation D5,
 * expanded by owned-skills-expansion): reusable store procedures ship as
 * contexture-OWNED skills. The canonical content is this module (versioned
 * with the package); a store carries a full copy at
 * `<procedures_path>/ctxr-<slug>/SKILL.md` — written by `ctxr init`,
 * refreshed by `ctxr update`, never hand-edited. The default location is
 * the directory harnesses with skill auto-discovery read, so there is no
 * wrapper and no extra hop; any other harness reaches the same file by
 * path from AGENTS.md. Operator-authored skills live alongside, untouched
 * by sync.
 *
 * Each skill is a decision procedure against commands that exist, not a
 * bare command sequence (owned-skills-expansion D2/D3): every rule is
 * stated against the store's CONFIGURED taxonomy, contexts, and relation
 * vocabulary — a shipped profile's layer names and any real context value
 * never appear in this file — and every "verify" step names the command
 * that verifies it. The one config-derived skill (placement) is rendered
 * per store, which is why a seed's body is a function of the config.
 */
export interface Procedure {
  /** Skill directory slug under config.harness.procedures_path (file is `<slug>/SKILL.md`). */
  file: string;
  /** The human title (the H1 in the skill body). */
  name: string;
  /** One line for skill-discovery metadata and the AGENTS.md index. */
  description: string;
  content: string;
}

interface ProcedureSeed {
  file: string;
  name: string;
  description: string;
  /** The markdown body below the H1, one entry per line, rendered against the store's config. */
  body: (config: StoreConfig) => string[];
}

export const MANAGED_SKILL_HEADER =
  '<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->';

/**
 * owned-skills-expansion D3: the placement procedure's termination test is
 * emitted only for a layer whose configured description implies an end
 * state; a layer whose description describes retired items is the
 * destination `ctxr archive` moves things to. Both are read off the
 * description text, never off a layer's name.
 */
const END_STATE_PATTERN = /\b(end[- ]state|finish(?:ed|es|ing)?|finish line|deadline|due date)\b/i;
const RETIRED_PATTERN = /\b(completed|abandoned|inactive|archived|retired|dormant)\b/i;

export function terminatingLayers(config: StoreConfig): TaxonomyLayerConfig[] {
  return config.taxonomy.layers.filter((layer) => END_STATE_PATTERN.test(layer.description) && !RETIRED_PATTERN.test(layer.description));
}

export function retiredLayers(config: StoreConfig): TaxonomyLayerConfig[] {
  return config.taxonomy.layers.filter((layer) => RETIRED_PATTERN.test(layer.description));
}

function skillDocument(seed: ProcedureSeed, config: StoreConfig): string {
  const lines = [
    '---',
    `name: ${seed.file}`,
    `description: ${seed.description}`,
    '---',
    '',
    MANAGED_SKILL_HEADER,
    '',
    `# ${seed.name}`,
    '',
    ...seed.body(config),
  ];
  return `${lines.join('\n')}\n`;
}

function joinNames(layers: TaxonomyLayerConfig[]): string {
  return layers.map((layer) => `**${layer.name}**`).join(' / ');
}

function placementLayerStep(config: StoreConfig): string[] {
  const { layers } = config.taxonomy;
  if (layers.length === 0) {
    return [
      '## 1. Which layer?',
      '',
      'This store declares no top-level layers, so there is no layer decision: place the note next to the notes',
      'it will link to most (`ctxr graph query neighbors <path>` on the closest existing note shows that cluster)',
      'and let wikilinks carry the structure.',
    ];
  }
  const lines = [
    '## 1. Which layer?',
    '',
    'Read AGENTS.md\'s "Placing a new note" section — it lists this store\'s configured layers with their',
    'descriptions and their visibility defaults. Choose by what the content fundamentally IS, not by surface',
    'keywords; a label on a location says nothing about what is actually kept there.',
  ];
  const terminating = terminatingLayers(config);
  if (terminating.length > 0) {
    lines.push(
      '',
      `- Termination test for ${joinNames(terminating)}: does this have a finish line? If it never closes, it does`,
      '  not belong there. An item in that layer that can never close is a smell — it either clutters the layer',
      '  as open-forever or gets retired prematurely. Never create one on purpose; an ongoing responsibility',
      '  with a standard to maintain belongs in a layer whose description says so.',
    );
  }
  const retired = retiredLayers(config);
  if (retired.length > 0) {
    lines.push(
      '',
      `- ${joinNames(retired)} is where the other layers' finished or dropped items go — never a first placement.`,
      '  Retire a note with `ctxr archive <path>` (a tracked move; frontmatter untouched).',
    );
  }
  lines.push('', 'If no layer fits, use the catch-all location that section names and revisit the placement later.');
  return lines;
}

const PLACEMENT: ProcedureSeed = {
  file: 'ctxr-placement',
  name: 'Placement',
  description: 'Choose the right taxonomy layer, location, and visibility for a new or relocated note in this contexture store, with the reasoning.',
  body: (config) => skillTemplate('ctxr-placement').replace('__LAYER_STEP__', placementLayerStep(config).join('\n')).split('\n'),
};

const INGEST_ORCHESTRATION: ProcedureSeed = {
  file: 'ctxr-ingest-orchestration',
  name: 'Ingest orchestration',
  description: 'Capture raw material into the inbox, run the dedupe check, read the existing cluster, decide new/update/merge/restructure, and ingest with source identity via the contexture CLI.',
  body: () => skillTemplate('ctxr-ingest-orchestration').replaceAll('__GRAPH_DOCUMENT_PATH__', GRAPH_DOCUMENT_RELATIVE_PATH).split('\n'),
};

const CONNECTION_FINDING: ProcedureSeed = {
  file: 'ctxr-connection-finding',
  name: 'Connection finding',
  description: 'Traverse the wikilink graph of the store (neighbors, paths, hubs, orphans) to find what a note already connects to.',
  body: () => skillTemplate('ctxr-connection-finding').replaceAll('__GRAPH_DOCUMENT_PATH__', GRAPH_DOCUMENT_RELATIVE_PATH).split('\n'),
};

/**
 * graph-context-document spec: the proposal skill groups by the CONFIGURED
 * relation vocabulary (the same names `ctxr graph build` types edges from)
 * and falls back to one group — never a relation name of its own.
 */
function relationGroupingStep(relations: readonly string[]): string[] {
  if (relations.length === 0) {
    return [
      '5. This store configures no relation vocabulary (`retrieval.relations` is empty), so present proposals as',
      '   a single **Related** group. Format each item as `[[Note]]` — reason.',
    ];
  }
  return [
    `5. Group proposals by this store's configured relation vocabulary: ${relations.map((r) => `**${r}**`).join(', ')}`,
    '   (`retrieval.relations` — the section headings carrying these names are what `ctxr graph build` types',
    '   edges from, so a link written under the right heading becomes a typed edge on the next build). Format',
    '   each item as `[[Note]]` — reason.',
  ];
}

const CONNECTION_PROPOSAL: ProcedureSeed = {
  file: 'ctxr-connection-proposal',
  name: 'Connection proposal',
  description: 'Discover the links a note should have, read each candidate before proposing, group by the store relation vocabulary, and write only approved links.',
  body: (config) => skillTemplate('ctxr-connection-proposal').replace('__RELATION_GROUPING_STEP__', relationGroupingStep(config.retrieval.relations).join('\n')).split('\n'),
};

const ROLLUP: ProcedureSeed = {
  file: 'ctxr-rollup',
  name: 'Rollup',
  description: 'Regenerate the synthesized current-state region of an entity note from every source that references it, with provenance for every fact.',
  body: () => skillTemplate('ctxr-rollup').split('\n'),
};

const SUBMIT: ProcedureSeed = {
  file: 'ctxr-submit',
  name: 'Submit',
  description: 'End a working session — re-scan, capture once, stage surgically, gate the external side effect, and open the reviewed pull request.',
  body: (config) => skillTemplate('ctxr-submit').replaceAll('__DEFAULT_BRANCH__', config.git.default_branch).split('\n'),
};

const LAND: ProcedureSeed = {
  file: 'ctxr-land',
  name: 'Land',
  description: 'Complete a reviewed session — merge its pull request, sync the default branch, and reclaim the worktree — one gated command, never a manual merge.',
  body: (config) => skillTemplate('ctxr-land').replaceAll('__DEFAULT_BRANCH__', config.git.default_branch).split('\n'),
};

const SESSION_LIFECYCLE: ProcedureSeed = {
  file: 'ctxr-session-lifecycle',
  name: 'Session lifecycle',
  description: 'Start a session worktree, re-scan before any plan, resolve conflicts, and sequence multiple pull requests — the frame ctxr-submit and ctxr-land sit inside.',
  body: (config) => skillTemplate('ctxr-session-lifecycle').replaceAll('__DEFAULT_BRANCH__', config.git.default_branch).split('\n'),
};

const SESSION_CAPTURE: ProcedureSeed = {
  file: 'ctxr-session-capture',
  name: 'Session capture',
  description: 'At the end of a session, propose durable store notes in one message with per-item approval, then write only what was approved.',
  body: () => skillTemplate('ctxr-session-capture').split('\n'),
};

const DERIVED_ARTIFACTS: ProcedureSeed = {
  file: 'ctxr-derived-artifacts',
  name: 'Derived artifacts',
  description: 'Refresh a generated artifact safely — check before build, read the counts back, never hand-edit inside a fence, keep derived files out of content commits.',
  body: (config) => skillTemplate('ctxr-derived-artifacts').replaceAll('__DEFAULT_BRANCH__', config.git.default_branch).split('\n'),
};

const ORGANIZE_AUDIT: ProcedureSeed = {
  file: 'ctxr-organize-audit',
  name: 'Organize audit',
  description: 'Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants), retire by moving, and classify broken links before fixing them.',
  body: () => skillTemplate('ctxr-organize-audit').split('\n'),
};

export const PROCEDURES: readonly ProcedureSeed[] = [
  INGEST_ORCHESTRATION,
  PLACEMENT,
  CONNECTION_FINDING,
  CONNECTION_PROPOSAL,
  ROLLUP,
  SESSION_LIFECYCLE,
  SUBMIT,
  LAND,
  SESSION_CAPTURE,
  DERIVED_ARTIFACTS,
  ORGANIZE_AUDIT,
];

/** The owned skills, rendered against one store's configuration — what `syncShippedSkills` writes. */
export function renderProcedures(config: StoreConfig): Procedure[] {
  return PROCEDURES.map((seed) => ({
    file: seed.file,
    name: seed.name,
    description: seed.description,
    content: skillDocument(seed, config),
  }));
}

/**
 * entry-doc-generation spec: every skill actually on disk — the contexture-
 * owned ones plus any operator-authored ones. This is what the AGENTS.md
 * index and verify --portable consume; the static PROCEDURES const is only
 * the canonical content syncShippedSkills writes.
 */
export function scanProcedures(root: string, config: StoreConfig): Promise<ScannedDoc[]> {
  return scanDocsDir(root, config.harness.procedures_path);
}

export function procedurePaths(config: StoreConfig): string[] {
  return PROCEDURES.map((p) => path.join(config.harness.procedures_path, p.file, SKILL_FILE_NAME).split(path.sep).join('/'));
}

/**
 * Brings every contexture-owned skill copy to the installed package's
 * content: written when missing, rewritten when different (byte-stable —
 * an up-to-date copy is not touched). Managed copies the installed version
 * no longer ships (recognised by the managed header) are removed, so a
 * renamed slug never leaves an orphan behind. Only files bearing the header
 * are ever removed; operator skills are untouched. Returns every path it
 * wrote or removed.
 */
export async function syncShippedSkills(root: string, config: StoreConfig): Promise<string[]> {
  const changed: string[] = [];
  for (const procedure of renderProcedures(config)) {
    const relativePath = path
      .join(config.harness.procedures_path, procedure.file, SKILL_FILE_NAME)
      .split(path.sep)
      .join('/');
    const absolutePath = path.join(root, relativePath);
    let existing: string | undefined;
    try {
      existing = await readFile(absolutePath, 'utf8');
    } catch {
      existing = undefined;
    }
    if (existing !== procedure.content) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFileAtomic(absolutePath, procedure.content);
      changed.push(relativePath);
    }
  }

  const shippedSlugs = new Set(PROCEDURES.map((p) => p.file));
  const skillsDir = path.join(root, config.harness.procedures_path);
  let entries: { name: string; isDirectory(): boolean }[] = [];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || shippedSlugs.has(entry.name)) continue;
    const skillFile = path.join(skillsDir, entry.name, SKILL_FILE_NAME);
    let content: string;
    try {
      content = await readFile(skillFile, 'utf8');
    } catch {
      continue;
    }
    if (!content.includes(MANAGED_SKILL_HEADER)) continue; // operator-authored: never touched
    await rm(path.join(skillsDir, entry.name), { recursive: true, force: true });
    changed.push(path.join(config.harness.procedures_path, entry.name, SKILL_FILE_NAME).split(path.sep).join('/'));
  }
  return changed;
}
