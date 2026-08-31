import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { DisclosureRung, DisclosureVerdict } from '../core/disclosure/model.js';
import { evaluateDisclosure } from '../core/disclosure/model.js';
import { scanNoteForLeaks, type LeakFinding } from '../core/disclosure/leak-scan.js';
import type { RunEnv } from '../core/env.js';
import { CheckAudienceRequiredError, NoteNotFoundError } from '../core/errors.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import { parseNote } from '../core/notes/parse.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface CheckFlags {
  path: string;
  audience?: string;
  scan?: boolean;
}

export interface CheckData {
  path: string;
  audience?: string;
  verdict?: DisclosureVerdict;
  rung?: DisclosureRung;
  leaks?: LeakFinding[];
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
 *
 * store-primitives-from-migration-audit spec (D3): `--scan` is a second,
 * independent mode — the same leak scan `ctxr lint` runs, for one note —
 * and does not require `--audience` (a leak isn't about one requesting
 * audience; it's about every configured marker context at once).
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

  if (flags.scan) {
    const leaks = scanNoteForLeaks(store.config, note);
    const findings: Finding[] = leaks.map((leak) => ({
      code: 'disclosure.leak',
      severity: 'warning',
      message: `"${leak.path}" matches a marker for context "${leak.context}", which cannot see this note: "${leak.matchedText}".`,
      subject: leak.path,
      details: { context: leak.context, pattern: leak.pattern, matchedText: leak.matchedText },
    }));
    return {
      exitCode: leaks.length > 0 ? ExitCode.CheckFailed : ExitCode.Ok,
      data: { path: relativePath, leaks },
      findings,
      humanSummary: leaks.length > 0 ? `${relativePath}: ${leaks.length} leak(s) found.` : `${relativePath}: no leaks found.`,
      storeRoot: store.root,
      schemaVersion: store.config.schema_version,
    };
  }

  if (!flags.audience) {
    throw new CheckAudienceRequiredError();
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
