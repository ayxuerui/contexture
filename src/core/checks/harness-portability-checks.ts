import { configuredAdapters } from '../../adapters/registry.js';
import { DEFAULT_SKILLS_PATH } from '../../config/defaults.js';
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

export const HARNESS_PORTABILITY_CHECKS = [conventionsSectionSizeCheck, skillsPathIsHarnessBrandedCheck];
