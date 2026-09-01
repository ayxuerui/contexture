import { DEFAULT_CONVENTION_MAX_BYTES } from '../../config/defaults.js';
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
 * `DEFAULT_CONVENTION_MAX_BYTES`) fails doctor loud rather than silently
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
    const budget = ctx.config.harness.convention_max_bytes ?? DEFAULT_CONVENTION_MAX_BYTES;
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

export const HARNESS_PORTABILITY_CHECKS = [conventionsSectionSizeCheck];
