import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import {
  AGENTS_MD_CANONICAL_FENCE,
  AGENTS_MD_CAPTURE_FENCE,
  AGENTS_MD_CONVENTIONS_FENCE,
  AGENTS_MD_LEG_ROUTING_FENCE,
  AGENTS_MD_PLACEMENT_FENCE,
  agentsMdPath,
  checkAgentsMdDrift,
} from '../core/agents-doc.js';
import { readCatalogSection } from '../core/catalog/build.js';
import { catalogSectionsFor } from '../core/catalog/model.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { readFencedRegionFromFile } from '../core/fs/fenced-region.js';
import { buildGraphFromNotes, graphBuildOptions } from '../core/graph/model.js';
import { writeGraph } from '../core/graph/persist.js';
import type { Fence } from '../core/markers.js';
import { listNotes } from '../core/notes/list.js';
import { scanSkills } from '../core/skills.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface VerifyFlags {
  portable?: boolean;
}

export interface VerifyStepResult {
  operation: string;
  status: 'pass' | 'fail';
  detail?: string;
}

export interface VerifyData {
  steps: VerifyStepResult[];
}

/** Every section that renders unconditionally — Mission is checked separately since it's optional. */
const ALWAYS_PRESENT_SECTIONS: readonly { label: string; fence: Fence }[] = [
  { label: 'store fundamentals', fence: AGENTS_MD_CANONICAL_FENCE },
  { label: 'retrieval routing', fence: AGENTS_MD_LEG_ROUTING_FENCE },
  { label: 'capture', fence: AGENTS_MD_CAPTURE_FENCE },
  { label: 'placement', fence: AGENTS_MD_PLACEMENT_FENCE },
  { label: 'store conventions', fence: AGENTS_MD_CONVENTIONS_FENCE },
];

/**
 * harness-portability spec: exercises core store operations "from an
 * environment with no harness-specific state present" — nothing here reads
 * any harness-specific file or env var, so the property under test holds
 * by construction; this command runs each named operation in order and
 * stops at the first failure, naming it (never running the rest).
 *
 * inline-conventions-and-mission: the old "every skill has an index entry"
 * check is gone along with the index itself. Portability is now verified by
 * confirming every managed AGENTS.md section is present, that its inlined
 * conventions/mission content matches the source files on disk (the same
 * drift `ctxr doctor` checks — see `integrity-checks.ts`), and that a skill
 * is reachable by path at the configured skills path.
 */
export async function execute(store: Store, _flags: VerifyFlags = {}): Promise<CommandOutcome<VerifyData>> {
  const steps: VerifyStepResult[] = [];

  // 1. A retrieval query — reading a catalog section works even before any
  // build has ever run (an empty, valid section), so this genuinely proves
  // the retrieval leg is reachable from nothing.
  try {
    const [firstSection] = catalogSectionsFor(store.config);
    await readCatalogSection(store, firstSection!.id);
    steps.push({ operation: 'retrieval query (catalog show)', status: 'pass' });
  } catch (err) {
    steps.push({
      operation: 'retrieval query (catalog show)',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
    return finish(store, steps);
  }

  // 2. A derived-artifact build.
  try {
    const notes = await listNotes(store.root, store.config);
    await writeGraph(store, buildGraphFromNotes(notes, graphBuildOptions(store.config)));
    steps.push({ operation: 'derived-artifact build (graph build)', status: 'pass' });
  } catch (err) {
    steps.push({
      operation: 'derived-artifact build (graph build)',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
    return finish(store, steps);
  }

  // 3. Every managed AGENTS.md section is present.
  for (const { label, fence } of ALWAYS_PRESENT_SECTIONS) {
    const region = await readFencedRegionFromFile(agentsMdPath(store.root), fence);
    if (region.length === 0) {
      steps.push({
        operation: `AGENTS.md section: ${label}`,
        status: 'fail',
        detail: `The "${label}" section is missing from AGENTS.md — run \`ctxr update\`.`,
      });
      return finish(store, steps);
    }
  }
  steps.push({ operation: 'AGENTS.md sections present', status: 'pass' });

  // 4. Inlined conventions/mission content matches its source files.
  const drift = await checkAgentsMdDrift(store.root, store.config);
  if (drift.driftedConventions.length > 0) {
    steps.push({
      operation: 'inlined conventions match source',
      status: 'fail',
      detail: `AGENTS.md's "Store conventions" section no longer matches: ${drift.driftedConventions.join(', ')} — run \`ctxr update\`.`,
    });
    return finish(store, steps);
  }
  steps.push({ operation: 'inlined conventions match source', status: 'pass' });

  if (store.config.organize.mission_path) {
    if (drift.driftedMission) {
      steps.push({
        operation: 'inlined mission matches source',
        status: 'fail',
        detail: `AGENTS.md's "Mission" section no longer matches "${drift.driftedMission}" — run \`ctxr update\`.`,
      });
      return finish(store, steps);
    }
    steps.push({ operation: 'inlined mission matches source', status: 'pass' });
  }

  // 6. Follow one skill by path at the configured skills path.
  const skills = await scanSkills(store.root, store.config);
  const first = skills[0];
  if (!first) {
    steps.push({
      operation: 'follow a skill',
      status: 'fail',
      detail: `No skill files exist at "${store.config.harness.skills_path}".`,
    });
    return finish(store, steps);
  }
  try {
    await readFile(path.join(store.root, first.path), 'utf8');
    steps.push({ operation: `follow skill "${first.title}" by path`, status: 'pass' });
  } catch (err) {
    steps.push({
      operation: `follow skill "${first.title}" by path`,
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
  }

  return finish(store, steps);
}

function finish(store: Store, steps: VerifyStepResult[]): CommandOutcome<VerifyData> {
  const failed = steps.find((s) => s.status === 'fail');
  const findings: Finding[] = failed
    ? [
        {
          code: 'verify.portable.failed',
          severity: 'error',
          message: `"${failed.operation}" failed: ${failed.detail ?? '(no detail)'}`,
          subject: failed.operation,
        },
      ]
    : [];

  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data: { steps },
    findings,
    humanSummary: failed
      ? `verify --portable failed at: ${failed.operation}`
      : `verify --portable: all ${steps.length} operation(s) succeeded.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
