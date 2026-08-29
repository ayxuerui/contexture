import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { DisclosureRung, DisclosureVerdict } from '../core/disclosure/model.js';
import { evaluateDisclosure } from '../core/disclosure/model.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { parseNote } from '../core/notes/parse.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface CheckFlags {
  path: string;
  audience: string;
}

export interface CheckData {
  path: string;
  audience: string;
  verdict: DisclosureVerdict;
  rung: DisclosureRung;
}

const VERDICT_EXIT_CODE: Record<DisclosureVerdict, number> = {
  allow: ExitCode.Ok,
  deny: ExitCode.DisclosureDeny,
  ask: ExitCode.DisclosureAsk,
};

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/**
 * disclosure-policy spec: the tri-state ALLOW/DENY/ASK verdict, each with
 * its own documented exit code (cli-contract's reserved 4/5), printing the
 * rung that produced it so a script or a human can see WHY, not just WHAT.
 */
export async function execute(env: RunEnv, store: Store, flags: CheckFlags): Promise<CommandOutcome<CheckData>> {
  const relativePath = toStoreRelativePath(env, store, flags.path);
  const absolutePath = path.join(store.root, relativePath);

  let note;
  try {
    note = await parseNote(absolutePath, relativePath);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
    throw err;
  }

  const { verdict, rung } = evaluateDisclosure(store.config, note, flags.audience);

  return {
    exitCode: VERDICT_EXIT_CODE[verdict] as ExitCode,
    data: { path: relativePath, audience: flags.audience, verdict, rung },
    findings: [],
    humanSummary: `${relativePath} for audience "${flags.audience}": ${verdict.toUpperCase()} (rung: ${rung})`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
