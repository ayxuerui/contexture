import { checkCatalogCoverage } from '../catalog/build.js';
import type { Finding } from '../envelope.js';
import { orphans } from '../graph/query.js';
import { hasSourceIdentity } from '../ingest/identity.js';
import { defineCheck } from './types.js';

const GRAPH_SKIP_REASON = 'graph has not been built yet — run `contexture graph build`';

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

/** context-organize spec: "broken links" — the graph's dangling links (not_found or ambiguous), reported not failed. Shares detection with the doctor-facing invariant checks/integrity-checks.ts:graphDanglingLinksCheck under a different id (task 9.4: two ids, two severity lanes, one condition, never double-counted within a single run). */
export const brokenLinksCheck = defineCheck({
  id: 'organize.broken_links',
  title: 'Notes with dangling wikilinks',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const graph = await ctx.graph();
    if (!graph) return { status: 'skip', skipReason: GRAPH_SKIP_REASON, findings: [] };
    const findings: Finding[] = graph.dangling.map((d) => ({
      code: 'organize.broken_link',
      severity: 'info',
      message: `"${d.from}" links to "${d.target}", which is ${d.reason === 'ambiguous' ? 'ambiguous' : 'not found'}.`,
      subject: d.from,
      details: { target: d.target, reason: d.reason },
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/** context-ingest / context-organize: material captured but never stamped with source identity. */
export const uningestedInboxCheck = defineCheck({
  id: 'organize.uningested_inbox_material',
  title: 'Inbox material not yet ingested',
  severity: 'observation',
  capability: 'context-organize',
  scopes: ['store'],
  async run(ctx) {
    const notes = await ctx.notes();
    const prefix = ctx.config.ingest.inbox_path.endsWith('/')
      ? ctx.config.ingest.inbox_path
      : `${ctx.config.ingest.inbox_path}/`;
    const findings: Finding[] = notes
      .filter((note) => note.path.startsWith(prefix) && !hasSourceIdentity(note))
      .map((note) => ({
        code: 'organize.uningested_inbox_material',
        severity: 'info',
        message: `"${note.path}" is in the inbox but has not been ingested.`,
        subject: note.path,
      }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * context-organize spec: "notes with no catalog entry as covered by
 * context-catalog" — the same underlying condition as `catalogCoverageCheck`
 * (doctor, invariant), surfaced here too as its own observation-severity
 * check id so lint can report it without doctor's invariant double-counting
 * lint's finding or vice versa (same pattern as the fail-closed-visibility
 * pair in Phase 5). Only `missing` is in scope here — `dangling` catalog
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

export const ORGANIZE_CHECKS = [orphanNotesCheck, brokenLinksCheck, uningestedInboxCheck, catalogGapsLintCheck];
