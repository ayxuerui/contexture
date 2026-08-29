import { readFile } from 'node:fs/promises';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { scanDocsDir, SKILL_FILE_NAME, type ScannedDoc } from './conventions.js';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * harness-portability spec (task 8.6, revised by entry-doc-generation D5):
 * reusable store procedures ship as contexture-OWNED skills. The canonical
 * content is this module (versioned with the package); a store carries a
 * full copy at `<procedures_path>/contexture-<slug>/SKILL.md` — written by
 * `ctxr init`, refreshed by `ctxr update`, never hand-edited. The default
 * location is the directory harnesses with skill auto-discovery read, so
 * there is no wrapper and no extra hop; any other harness reaches the same
 * file by path from AGENTS.md. Operator-authored skills live alongside,
 * untouched by sync. Each seed names the real CLI commands built in
 * earlier phases, in the order a judgment-driven operation uses them.
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

export const MANAGED_SKILL_HEADER =
  '<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->';

export const PROCEDURES: readonly Procedure[] = [
  {
    file: 'contexture-ingest-orchestration',
    name: 'Ingest orchestration',
    description: 'Capture raw material into the inbox, run the dedupe check, and ingest it with source identity via the contexture CLI.',
    content: `---
name: contexture-ingest-orchestration
description: Capture raw material into the inbox, run the dedupe check, and ingest it with source identity via the contexture CLI.
---

${MANAGED_SKILL_HEADER}

# Ingest orchestration

1. Capture: write a plain markdown file directly into the inbox (see AGENTS.md's capture section) — no source-identity frontmatter.
2. Check: run \`ctxr source check <path> --source-id <id>\` and read the verdict — \`new\`, \`already_ingested\`, \`alternate_source_match\`, or \`multiple_matches\`.
3. On \`multiple_matches\`, stop and resolve the ambiguity yourself; do not guess which existing note it is.
4. On \`new\` (or a deliberate decision to ingest anyway despite an \`alternate_source_match\`), run \`ctxr ingest <path> --source-type <type> --source-id <id>\`.
5. The result already has a catalog entry — no separate catalog step is needed.
`,
  },
  {
    file: 'contexture-placement',
    name: 'Placement',
    description: 'Choose the right taxonomy layer for a new or relocated note in this contexture store.',
    content: `---
name: contexture-placement
description: Choose the right taxonomy layer for a new or relocated note in this contexture store.
---

${MANAGED_SKILL_HEADER}

# Placement

1. Read AGENTS.md's "Placing a new note" section for this store's configured taxonomy layers (or lack thereof).
2. Choose the layer whose description best matches the note; if none fits, use the catch-all location.
3. To relocate a note that already exists (not a first placement), use \`ctxr archive <path>\` if it is being retired, or a plain tracked \`git mv\` for an ordinary re-placement — either way, the note's frontmatter (including its visibility field) is left untouched.
4. Run \`ctxr lint\` afterward; "uningested inbox material" and "no catalog entry" findings will surface anything left unplaced.
`,
  },
  {
    file: 'contexture-connection-finding',
    name: 'Connection finding',
    description: 'Find related notes via the wikilink graph of the store (neighbors, paths, hubs) and write rollups from gathered sources.',
    content: `---
name: contexture-connection-finding
description: Find related notes via the wikilink graph of the store (neighbors, paths, hubs) and write rollups from gathered sources.
---

${MANAGED_SKILL_HEADER}

# Connection finding

1. Run \`ctxr graph build\` to refresh the wikilink graph from the store's current notes.
2. To find what a note connects to or from, run \`ctxr graph query neighbors <path>\` (add \`--depth\` for further hops, \`--direction in|out|both\`).
3. To find a path between two notes, run \`ctxr graph query path <from> <to>\`.
4. To find the most-referenced notes, run \`ctxr graph query hubs\`.
5. Before writing a rollup for an entity, run \`ctxr rollup gather <entity>\` to enumerate candidate source notes — read those, then commit your synthesis with \`ctxr rollup write <entity> --content-file <path>\`.
`,
  },
  {
    file: 'contexture-organize-audit',
    name: 'Organize audit',
    description: 'Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants).',
    content: `---
name: contexture-organize-audit
description: Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants).
---

${MANAGED_SKILL_HEADER}

# Organize audit

1. Run \`ctxr lint\` for a full health report — orphan notes, broken links, uningested inbox material, and catalog gaps. It always exits 0; read its findings, it never blocks anything.
2. Run \`ctxr doctor\` to check the invariants that DO block: catalog coverage, fail-closed visibility, hook health, and more.
3. Address doctor's failures before submitting a session; lint's findings are a judgment call for whoever is doing the audit.
`,
  },
];

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
 * an up-to-date copy is not touched), and only ever the `contexture-*`
 * directories this module owns. Returns the paths it wrote.
 */
export async function syncShippedSkills(root: string, config: StoreConfig): Promise<string[]> {
  const changed: string[] = [];
  for (const procedure of PROCEDURES) {
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
  return changed;
}
