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
import { resolveOnPath } from '../core/environment/probe.js';
import { scanSkills } from '../core/skills.js';
import { sanctionedPath } from '../core/write-lifecycle/path-gate.js';
import type { RunEnv } from '../core/env.js';
import { NoCommitToVerifyError } from '../core/errors.js';
import { runIsolatedVerify } from '../core/harness/isolated-run.js';
import { resolveHead } from '../core/git/worktree.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/**
 * The tool `templates/skills/ctxr-submit.md` and `ctxr-land.md` drive. Hardcoded
 * on purpose: accepting a tool name from configuration would let a store point
 * the check at something it knows is present (D4).
 */
const WRITE_PATH_TOOL = 'gh';

export interface VerifyFlags {
  portable?: boolean;
}

export interface VerifyStepResult {
  operation: string;
  /**
   * isolate-the-portability-test: `skip` is reported when an operation has
   * nothing to exercise in this store — a conditional artifact that is not
   * configured. Only `fail` decides the exit code, so a skipped step is
   * visible in the envelope without ever changing the verdict.
   */
  status: 'pass' | 'fail' | 'skip';
  detail?: string;
}

export interface VerifyData {
  steps: VerifyStepResult[];
  /** Present only in portable mode: the commit the disposable checkout was made from. */
  commit?: string;
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
export async function execute(env: RunEnv, store: Store, flags: VerifyFlags = {}): Promise<CommandOutcome<VerifyData>> {
  if (flags.portable) return executePortable(env, store);
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

  // 7. The write-path gate — the store's surviving refusal mechanism. Every
  // other operation here is a happy path; this one asks whether the gate still
  // says no. The path escapes the store, which `sanctionedPath` refuses
  // unconditionally: its sanctioned-location rule is inert until
  // `write_lifecycle.writable_paths` is declared, so a step built on that half
  // would pass vacuously on a default store (D3).
  const gated = await sanctionedPath(store.config, store.root, path.join('..', 'outside.md'));
  if (gated.ok || gated.reason === undefined) {
    steps.push({
      operation: 'write-path gate refuses an escaping path',
      status: 'fail',
      detail: 'the gate produced no refusal for a path resolving outside the store',
    });
    return finish(store, steps);
  }
  steps.push({ operation: 'write-path gate refuses an escaping path', status: 'pass' });

  // 8. The external tooling the shipped write-path skills invoke. Presence
  // only — nothing is executed, and no tool name comes from configuration.
  const resolved = await resolveOnPath(WRITE_PATH_TOOL, env.env);
  if (resolved === null) {
    steps.push({
      operation: `write-path prerequisite "${WRITE_PATH_TOOL}" on PATH`,
      status: 'fail',
      detail: `"${WRITE_PATH_TOOL}" is not on PATH; the shipped submit and land skills invoke it.`,
    });
    return finish(store, steps);
  }
  steps.push({ operation: `write-path prerequisite "${WRITE_PATH_TOOL}" on PATH`, status: 'pass' });

  return finish(store, steps);
}

function finish(store: Store, steps: VerifyStepResult[], commit?: string): CommandOutcome<VerifyData> {
  // Only `fail` is failing — a skipped operation never changes the exit code.
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

  // D2: a portable pass is a statement about the recorded commit, never about
  // the working tree, so the summary always names which commit it was.
  const at = commit === undefined ? '' : ` at commit ${commit.slice(0, 12)}`;
  const mode = commit === undefined ? 'verify' : 'verify --portable';
  return {
    exitCode: failed ? ExitCode.CheckFailed : ExitCode.Ok,
    data: commit === undefined ? { steps } : { steps, commit },
    findings,
    humanSummary: failed
      ? `${mode} failed${at} at: ${failed.operation}`
      : `${mode}${at}: all ${steps.length} operation(s) succeeded.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

/**
 * D1/D2: verifies the store's RECORDED COMMIT in a disposable checkout, in a
 * child process with no harness state reachable. The refusal below is a value
 * check on `resolveHead` rather than a caught git error, and it runs before
 * anything is created — an unborn HEAD leaves no checkout behind.
 */
async function executePortable(env: RunEnv, store: Store): Promise<CommandOutcome<VerifyData>> {
  const commit = await resolveHead(env.git, store.root);
  if (commit === null) throw new NoCommitToVerifyError();

  const isolated = await runIsolatedVerify(env.git, store.root, env.env, commit);
  const steps: VerifyStepResult[] = isolated.steps.map((step) => ({
    operation: step.operation,
    status: step.status === 'fail' ? 'fail' : step.status === 'skip' ? 'skip' : 'pass',
    ...(step.detail === undefined ? {} : { detail: step.detail }),
  }));
  // The requirement's "no harness state" clause, enforced: if the child wrote
  // into the scrubbed home, the run was not isolated from what it claimed.
  if (!isolated.homeWasEmpty) {
    steps.push({
      operation: 'isolated run leaves no harness state',
      status: 'fail',
      detail: 'the child wrote into the scrubbed home directory, so the run was not isolated from harness state',
    });
    return finish(store, steps, isolated.commit);
  }
  if (steps.length === 0) {
    steps.push({
      operation: 'isolated run',
      status: 'fail',
      detail: `the isolated child produced no verifiable output (exit ${isolated.exitCode})`,
    });
  }
  return finish(store, steps, isolated.commit);
}
