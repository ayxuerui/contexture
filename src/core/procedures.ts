import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { scanDocsDir, type ScannedDoc } from './conventions.js';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * harness-portability spec (task 8.6): reusable store procedures as
 * portable markdown, reachable by path independent of any harness's
 * auto-discovery mechanism — a non-auto-discovering harness can be handed
 * one of these paths directly and follow it. These are documentation, not
 * code: each names the real CLI commands built in earlier phases, in the
 * order a judgment-driven operation actually uses them.
 */
export interface Procedure {
  /** Filename under config.harness.procedures_path. */
  file: string;
  /** The name AGENTS.md's procedure index and `verify --portable` both use to refer to this operation. */
  name: string;
  /** One line for harness skill-discovery metadata (contexture-home-layout spec). */
  description: string;
  content: string;
}

export const PROCEDURES: readonly Procedure[] = [
  {
    file: 'ingest-orchestration.md',
    name: 'Ingest orchestration',
    description: 'Capture raw material into the inbox, run the dedupe check, and ingest it with source identity via the contexture CLI.',
    content: `---
title: Ingest orchestration
description: Capture raw material into the inbox, run the dedupe check, and ingest it with source identity via the contexture CLI.
---

# Ingest orchestration

1. Capture: write a plain markdown file directly into the inbox (see AGENTS.md's capture section) — no source-identity frontmatter.
2. Check: run \`ctxr source check <path> --source-id <id>\` and read the verdict — \`new\`, \`already_ingested\`, \`alternate_source_match\`, or \`multiple_matches\`.
3. On \`multiple_matches\`, stop and resolve the ambiguity yourself; do not guess which existing note it is.
4. On \`new\` (or a deliberate decision to ingest anyway despite an \`alternate_source_match\`), run \`ctxr ingest <path> --source-type <type> --source-id <id>\`.
5. The result already has a catalog entry — no separate catalog step is needed.
`,
  },
  {
    file: 'placement.md',
    name: 'Placement',
    description: 'Choose the right taxonomy layer for a new or relocated note in this contexture store.',
    content: `---
title: Placement
description: Choose the right taxonomy layer for a new or relocated note in this contexture store.
---

# Placement

1. Read AGENTS.md's "Placing a new note" section for this store's configured taxonomy layers (or lack thereof).
2. Choose the layer whose description best matches the note; if none fits, use the catch-all location.
3. To relocate a note that already exists (not a first placement), use \`ctxr archive <path>\` if it is being retired, or a plain tracked \`git mv\` for an ordinary re-placement — either way, the note's frontmatter (including its visibility field) is left untouched.
4. Run \`ctxr lint\` afterward; "uningested inbox material" and "no catalog entry" findings will surface anything left unplaced.
`,
  },
  {
    file: 'connection-finding.md',
    name: 'Connection finding',
    description: 'Find related notes via the wikilink graph of the store (neighbors, paths, hubs) and write rollups from gathered sources.',
    content: `---
title: Connection finding
description: Find related notes via the wikilink graph of the store (neighbors, paths, hubs) and write rollups from gathered sources.
---

# Connection finding

1. Run \`ctxr graph build\` to refresh the wikilink graph from the store's current notes.
2. To find what a note connects to or from, run \`ctxr graph query neighbors <path>\` (add \`--depth\` for further hops, \`--direction in|out|both\`).
3. To find a path between two notes, run \`ctxr graph query path <from> <to>\`.
4. To find the most-referenced notes, run \`ctxr graph query hubs\`.
5. Before writing a rollup for an entity, run \`ctxr rollup gather <entity>\` to enumerate candidate source notes — read those, then commit your synthesis with \`ctxr rollup write <entity> --content-file <path>\`.
`,
  },
  {
    file: 'organize-audit.md',
    name: 'Organize audit',
    description: 'Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants).',
    content: `---
title: Organize audit
description: Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants).
---

# Organize audit

1. Run \`ctxr lint\` for a full health report — orphan notes, broken links, uningested inbox material, and catalog gaps. It always exits 0; read its findings, it never blocks anything.
2. Run \`ctxr doctor\` to check the invariants that DO block: catalog coverage, fail-closed visibility, hook health, and more.
3. Address doctor's failures before submitting a session; lint's findings are a judgment call for whoever is doing the audit.
`,
  },
];

/**
 * entry-doc-generation spec: every procedure file actually on disk — the
 * shipped seeds plus any operator-added ones. This is what the AGENTS.md
 * index, skill generation, and verify --portable all consume; the static
 * PROCEDURES const remains only the seed content ensureProcedureFiles
 * writes. Shipped seeds carry no frontmatter, so their metadata falls back
 * to the first heading (which matches their PROCEDURES name).
 */
export function scanProcedures(root: string, config: StoreConfig): Promise<ScannedDoc[]> {
  return scanDocsDir(root, config.harness.procedures_path);
}

export function procedurePaths(config: StoreConfig): string[] {
  return PROCEDURES.map((p) => path.join(config.harness.procedures_path, p.file).split(path.sep).join('/'));
}

/** Creates any procedure-pack file that doesn't exist yet — never overwrites an existing (possibly customized) one. */
export async function ensureProcedureFiles(root: string, config: StoreConfig): Promise<string[]> {
  const created: string[] = [];
  for (const procedure of PROCEDURES) {
    const relativePath = path.join(config.harness.procedures_path, procedure.file).split(path.sep).join('/');
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFileAtomic(absolutePath, procedure.content);
      created.push(relativePath);
    }
  }
  return created;
}
