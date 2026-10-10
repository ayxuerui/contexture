import { readFile } from 'node:fs/promises';
import { configuredAdapters } from '../../adapters/registry.js';
import { DEFAULT_ENTRY_DOCUMENT_TARGET_BYTES, DEFAULT_SKILLS_PATH } from '../../config/defaults.js';
import { GENERIC_START_RE } from '../fs/fenced-region.js';
import { effectiveEntryDocumentMaxBytes } from '../harness/bridge.js';
import { AGENTS_MD_CONVENTIONS_FENCE, agentsMdPath } from '../agents-doc.js';
import type { Finding } from '../envelope.js';
import { readFencedRegionFromFile } from '../fs/fenced-region.js';
import { defineCheck } from './types.js';

/**
 * compose-store-guidance-documents design.md D6: inlining every convention
 * file's full body into AGENTS.md's "Store conventions" section
 * (inline-conventions-and-mission) removed the natural size bound an index
 * provided — an unbounded custom part could make AGENTS.md unwieldy. A
 * configured ceiling (`harness.convention_max_bytes`, defaulting to
 * the schema's shipped default) fails doctor loud rather than silently
 * truncating content the inlining exists to surface.
 */
export const conventionsSectionSizeCheck = defineCheck({
  id: 'harness_portability.conventions_section_size',
  title: "AGENTS.md's inlined \"Store conventions\" section stays within its configured size budget",
  severity: 'invariant',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const region = await readFencedRegionFromFile(agentsMdPath(ctx.storeRoot), AGENTS_MD_CONVENTIONS_FENCE);
    if (region.length === 0) {
      return { status: 'skip', skipReason: 'AGENTS.md has not been generated yet — run `ctxr update`', findings: [] };
    }
    const size = Buffer.byteLength(region.join('\n'), 'utf8');
    const budget = ctx.config.harness.convention_max_bytes;
    if (size <= budget) return { status: 'pass', findings: [] };

    const finding: Finding = {
      code: 'harness_portability.conventions_section_size_exceeded',
      severity: 'error',
      message: `AGENTS.md's "Store conventions" section is ${size} bytes, exceeding the configured budget of ${budget}. Trim a convention file's content or raise \`harness.convention_max_bytes\`.`,
      details: { size, budget },
    };
    return { status: 'fail', findings: [finding] };
  },
});

/**
 * harness-portability spec (retire-store-migrations): "A skills path sitting
 * on a harness's own branded directory is reported."
 *
 * `bridgeHarnessSkills` skips a harness whose directory already equals the
 * canonical skills path, and `harness_portability.skills_bridge` skips on the
 * same equality — correctly, since a harness needing no bridge has none to
 * break. That leaves one state neither can express: the configured skills
 * path having drifted onto a harness's OWN branded directory, where no bridge
 * is created and any harness the store has not declared finds nothing.
 *
 * Compared against the adapter's declared `skillsDir`, never
 * `effectiveSkillsDir` — a store that sets `adapters[].skills_dir` equal to
 * the canonical path is deliberately opting out of a bridge, which the
 * adapters spec supports by name, and must not be reported for it.
 *
 * An observation, not an invariant: this capability's "A store predating this
 * default keeps its own path" scenario permits exactly this state, with no
 * relocation and no migration. The store is told, not blocked.
 */
export const skillsPathIsHarnessBrandedCheck = defineCheck({
  id: 'harness_portability.skills_path_is_harness_branded',
  title: 'The configured skills path is not a declared harness\'s own branded directory',
  severity: 'observation',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const canonical = ctx.config.harness.skills_path;
    const findings: Finding[] = [];
    for (const adapter of configuredAdapters(ctx.config, 'harness-generation')) {
      if (adapter.skillsDir !== canonical) continue;
      // support-codex-and-antigravity-harnesses: an adapter that declares the
      // cross-harness location itself (codex, antigravity) reads the directory
      // every other harness is bridged to — that is not a branded path.
      if (adapter.skillsDir === DEFAULT_SKILLS_PATH) continue;
      findings.push({
        code: 'harness_portability.skills_path_is_harness_branded',
        severity: 'info',
        message: `harness.skills_path is "${canonical}", which is ${adapter.id}'s own branded skills directory. No bridge is created for it, and a harness this store does not declare finds no skills there. The cross-harness location is "${DEFAULT_SKILLS_PATH}".`,
        subject: adapter.id,
        details: { path: canonical, canonical: DEFAULT_SKILLS_PATH },
      });
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

async function readAgentsMd(storeRoot: string): Promise<string | null> {
  try {
    return await readFile(agentsMdPath(storeRoot), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * lean-composed-entry-document:
 * the generated section a byte offset falls inside — the last
 * `contexture:<region>` fence opened at or before it — so a finding says
 * what a harness stops reading, not just how much. `null` when the offset
 * precedes every fence (hand-written preamble).
 */
export function sectionAtByte(content: string, offset: number): string | null {
  let consumed = 0;
  let current: string | null = null;
  for (const line of content.split('\n')) {
    if (consumed > offset) break;
    const start = GENERIC_START_RE.exec(line);
    if (start) current = start[1]!;
    consumed += Buffer.byteLength(line, 'utf8') + 1;
  }
  return current;
}

/**
 * lean-composed-entry-document: "The entry document fits the harnesses that
 * read it." An invariant, because past a declared harness's read limit the
 * content is silently never seen by that harness. Store scope only — the
 * pre-commit run never sees it, so an over-limit store can still commit the
 * edits that bring it back under.
 */
export const entryDocumentReadLimitCheck = defineCheck({
  id: 'harness_portability.entry_document_read_limit',
  title: 'AGENTS.md fits within the read limit of every declared harness',
  severity: 'invariant',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const content = await readAgentsMd(ctx.storeRoot);
    if (content === null) {
      return { status: 'skip', skipReason: 'AGENTS.md has not been generated yet — run `ctxr update`', findings: [] };
    }
    const size = Buffer.byteLength(content, 'utf8');
    const findings: Finding[] = [];
    for (const adapter of configuredAdapters(ctx.config, 'harness-generation')) {
      const limit = effectiveEntryDocumentMaxBytes(ctx.config, adapter.id, adapter.entryDocumentMaxBytes);
      if (limit === undefined || size <= limit) continue;
      const section = sectionAtByte(content, limit);
      findings.push({
        code: 'harness_portability.entry_document_read_limit_exceeded',
        severity: 'error',
        message:
          `AGENTS.md is ${size} bytes; ${adapter.id} stops reading at ${limit}, ` +
          `${section ? `inside the "${section}" section` : 'before the first generated section'}. ` +
          'Move guidance that is not needed on every turn into a file declaring `read_when`, or trim the mission.',
        subject: adapter.id,
        details: { size, limit, section },
      });
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * lean-composed-entry-document D3: the target is a judgment about per-turn
 * cost and adherence, not a fact about any harness — an observation, never a
 * failure.
 */
export const entryDocumentTargetSizeCheck = defineCheck({
  id: 'harness_portability.entry_document_target_size',
  title: 'AGENTS.md stays within its target size',
  severity: 'observation',
  capability: 'harness-portability',
  scopes: ['store'],
  async run(ctx) {
    const content = await readAgentsMd(ctx.storeRoot);
    if (content === null) {
      return { status: 'skip', skipReason: 'AGENTS.md has not been generated yet — run `ctxr update`', findings: [] };
    }
    const size = Buffer.byteLength(content, 'utf8');
    const target = ctx.config.harness.entry_document_target_bytes ?? DEFAULT_ENTRY_DOCUMENT_TARGET_BYTES;
    if (size <= target) return { status: 'pass', findings: [] };
    return {
      status: 'fail',
      findings: [
        {
          code: 'harness_portability.entry_document_over_target',
          severity: 'info',
          message:
            `AGENTS.md is ${size} bytes, over its ${target}-byte target. Every byte loads on every turn: ` +
            'move guidance that matters only for one task into a file declaring `read_when`.',
          details: { size, target },
        },
      ],
    };
  },
});

export const HARNESS_PORTABILITY_CHECKS = [
  conventionsSectionSizeCheck,
  skillsPathIsHarnessBrandedCheck,
  entryDocumentReadLimitCheck,
  entryDocumentTargetSizeCheck,
];
