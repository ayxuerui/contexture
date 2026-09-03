import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AGENTS_MD_SECTION_ORDER, agentsMdPath } from '../agents-doc.js';
import { checkCatalogCoverage } from '../catalog/build.js';
import type { Finding } from '../envelope.js';
import { reorderFencedRegions } from '../fs/fenced-region.js';
import { orphans } from '../graph/query.js';
import { findStaleRollups } from '../rollup.js';
import { defineCheck } from './types.js';

const GRAPH_SKIP_REASON = 'graph has not been built yet — run `ctxr graph build`';

/** context-organize spec: "orphaned notes" — reported by lint, never failed by doctor. */
export const orphanNotesCheck = defineCheck({
  id: 'organize.orphan_notes',
  title: 'Notes with no links in or out',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const graph = await ctx.graph();
    if (!graph) return { status: 'skip', skipReason: GRAPH_SKIP_REASON, findings: [] };
    const findings: Finding[] = orphans(graph).map((id) => ({
      code: 'organize.orphan_note',
      severity: 'info',
      message: `"${id}" has no links in or out.`,
      subject: id,
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * context-organize spec: "broken links" — a link that resolves to no note at all
 * (`not_found`), reported not failed. `graph.dangling` also carries `ambiguous`-reason
 * records (a link matching two or more notes' basenames), but those are
 * checks/integrity-checks.ts:graphAmbiguousLinksCheck's alone (doctor, invariant): resolution
 * is mechanically broken there, with an always-applicable fix, unlike a `not_found` link,
 * which can't be told apart from a healthy forward reference — so this check filters
 * `ambiguous` out rather than sharing it.
 */
export const brokenLinksCheck = defineCheck({
  id: 'organize.broken_links',
  title: 'Notes with dangling wikilinks',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const graph = await ctx.graph();
    if (!graph) return { status: 'skip', skipReason: GRAPH_SKIP_REASON, findings: [] };
    const findings: Finding[] = graph.dangling
      .filter((d) => d.reason === 'not_found')
      .map((d) => ({
        code: 'organize.broken_link',
        severity: 'info',
        message: `"${d.from}" links to "${d.target}", which is not found.`,
        subject: d.from,
        details: { target: d.target, reason: d.reason },
      }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * context-organize: material still sitting in the inbox.
 *
 * Read off the filesystem, not out of `ctx.notes()`. The inbox lives inside
 * the capture tier, which is a declared retrieval exclusion, so a capture is
 * not a note and note enumeration cannot see it — a version of this check
 * that filtered notes would report nothing, forever, and look healthy doing
 * it. Location is also the whole condition: a capture pipeline may write a
 * source type and id at capture time, so absent frontmatter no longer
 * distinguishes ingested from not. Leaving the inbox is what ingest does.
 */
export const uningestedInboxCheck = defineCheck({
  id: 'organize.uningested_inbox_material',
  title: 'Inbox material not yet ingested',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const inboxPath = ctx.config.ingest.inbox_path;
    const findings: Finding[] = (await filesUnder(path.join(ctx.storeRoot, inboxPath)))
      .map((relativeToInbox) => `${inboxPath.replace(/\/+$/, '')}/${relativeToInbox}`)
      .sort()
      .map((capturePath) => ({
        code: 'organize.uningested_inbox_material',
        severity: 'info',
        message: `"${capturePath}" is in the inbox but has not been ingested.`,
        subject: capturePath,
      }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/** Every file under `dir`, recursively, as forward-slash paths relative to it. An absent directory has none. */
async function filesUnder(dir: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const found: string[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      found.push(...(await filesUnder(path.join(dir, entry.name))).map((nested) => `${entry.name}/${nested}`));
    } else if (entry.isFile() && entry.name !== '.gitkeep') {
      found.push(entry.name);
    }
  }
  return found;
}

/**
 * context-organize spec: "notes with no catalog entry as covered by
 * context-catalog" — the same underlying condition as `catalogCoverageCheck`
 * (doctor, invariant), surfaced here too as its own observation-severity
 * check id so lint can report it without doctor's invariant double-counting
 * lint's finding or vice versa. Only `missing` is in scope here — `dangling` catalog
 * entries are a stricter integrity concern doctor alone owns.
 */
export const catalogGapsLintCheck = defineCheck({
  id: 'organize.catalog_gaps',
  title: 'Notes with no catalog entry',
  severity: 'observation',
  capability: 'context-catalog',
  scopes: ['store'],
  async run(ctx) {
    const { missing } = await checkCatalogCoverage({ root: ctx.storeRoot, config: ctx.config });
    const findings: Finding[] = missing.map((notePath) => ({
      code: 'catalog.coverage.missing',
      severity: 'info',
      message: `"${notePath}" is retrievable but has no catalog entry.`,
      subject: notePath,
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/** context-organize spec (store-primitives-from-migration-audit D4): a rollup with no timestamp, or one whose backlinks have moved past it, reported not failed. */
export const rollupStaleCheck = defineCheck({
  id: 'organize.rollup_stale',
  title: 'Entity rollups whose sources have moved past their last synthesis',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const notes = await ctx.notes();
    const stale = await findStaleRollups(ctx.git, ctx.storeRoot, notes, {}, ctx.config.organize.rollup_stale_days);
    const findings: Finding[] = stale.map((entry) => ({
      code: 'organize.rollup_stale',
      severity: 'info',
      message:
        entry.rolledUp === null
          ? `"${entry.entity}" has a rollup section but no recorded rollup timestamp.`
          : `"${entry.entity}"'s rollup is stale — "${entry.newestBacklink!.path}" was modified after the last rollup.`,
      subject: entry.entity,
      details: { rolledUp: entry.rolledUp, newestBacklink: entry.newestBacklink },
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * harness-portability spec (inline-conventions-and-mission): "Generated
 * sections render in a fixed order" — hand-written content interrupting the
 * managed fences' contiguity blocks `ctxr update` from reordering them to
 * the fixed layout (`reorderFencedRegions`' own conservative rule: never
 * relocate content it can't be sure sits outside every managed section).
 * Reported here as an observation, not by `doctor`: `doctor` runs only
 * `severity: 'invariant'` checks (`src/commands/doctor.ts`), and a store
 * whose sections are merely out of the preferred order still functions —
 * this is exactly the report-don't-block condition lint exists for.
 */
export const agentsMdSectionOrderBlockedCheck = defineCheck({
  id: 'harness_portability.agents_md_section_order_blocked',
  title: "AGENTS.md's managed sections can be reordered to the standard layout",
  severity: 'observation',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    let content: string;
    try {
      content = await readFile(agentsMdPath(ctx.storeRoot), 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
      return { status: 'skip', skipReason: 'AGENTS.md has not been generated yet — run `ctxr update`', findings: [] };
    }
    const { blocked } = reorderFencedRegions(content, AGENTS_MD_SECTION_ORDER);
    const findings: Finding[] = blocked
      ? [
          {
            code: 'harness_portability.agents_md_section_order_blocked',
            severity: 'info',
            message:
              'AGENTS.md has hand-written content between two managed sections, so `ctxr update` cannot reorder them to the standard layout. Move the hand-written content outside every managed section, then re-run `ctxr update`.',
          },
        ]
      : [];
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const ORGANIZE_CHECKS = [
  orphanNotesCheck,
  brokenLinksCheck,
  uningestedInboxCheck,
  catalogGapsLintCheck,
  rollupStaleCheck,
  agentsMdSectionOrderBlockedCheck,
];
