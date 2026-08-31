import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { agentsMdPath } from '../core/agents-doc.js';
import { readCatalogSection } from '../core/catalog/build.js';
import { catalogSectionsFor } from '../core/catalog/model.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { buildGraphFromNotes, graphBuildOptions } from '../core/graph/model.js';
import { writeGraph } from '../core/graph/persist.js';
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

function skillIndexEntry(name: string, relativePath: string): string {
  return `[${name}](${relativePath})`;
}

/**
 * harness-portability spec: exercises core store operations "from an
 * environment with no harness-specific state present" — nothing here reads
 * any harness-specific file or env var, so the property under test holds
 * by construction; this command just runs the three named operations in
 * order and stops at the first failure, naming it (never running the rest).
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

  // 3. Follow one skill via the AGENTS.md index: every canonical skill
  // must have an index entry, and at least one must be readable.
  let agentsMdContent: string;
  try {
    agentsMdContent = await readFile(agentsMdPath(store.root), 'utf8');
  } catch (err) {
    steps.push({
      operation: 'skill index (AGENTS.md)',
      status: 'fail',
      detail: err instanceof Error ? err.message : String(err),
    });
    return finish(store, steps);
  }

  // entry-doc-generation spec: the index must cover every skill actually on
  // disk — shipped seeds and operator-added files alike.
  const skills = await scanSkills(store.root, store.config);
  for (const skill of skills) {
    if (!agentsMdContent.includes(skillIndexEntry(skill.title, skill.path))) {
      steps.push({
        operation: `skill index entry for "${skill.title}"`,
        status: 'fail',
        detail: `AGENTS.md's skill index has no entry for "${skill.title}".`,
      });
      return finish(store, steps);
    }
  }

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
    steps.push({ operation: `follow skill "${first.title}"`, status: 'pass' });
  } catch (err) {
    steps.push({
      operation: `follow skill "${first.title}"`,
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
