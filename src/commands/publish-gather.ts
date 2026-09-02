import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { evaluateDisclosure, VERDICT_EXIT_CODE, worstVerdict, type DisclosureRung, type DisclosureVerdict } from '../core/disclosure/model.js';
import { scanNoteForLeaks, type LeakFinding } from '../core/disclosure/leak-scan.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError, PublishAudienceRequiredError, PublishSelectorConflictError, PublishSelectorRequiredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { extractLinkTargets } from '../core/graph/model.js';
import { listNotes, type Note } from '../core/notes/list.js';
import { parseNote } from '../core/notes/parse.js';
import { canSee, resolveVisibility } from '../core/notes/visibility.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishGatherFlags {
  under?: string;
  note?: string;
  entity?: string;
  as?: string;
  audience?: string;
}

export interface PublishGatherEntry {
  path: string;
  verdict: DisclosureVerdict;
  rung: DisclosureRung;
  leaks: LeakFinding[];
}

export interface PublishGatherData {
  selector: 'under' | 'note' | 'entity' | 'as';
  subject: string;
  audience: string;
  count: number;
  notes: PublishGatherEntry[];
  verdict: DisclosureVerdict;
}

function toStoreRelativePath(env: RunEnv, store: Store, givenPath: string): string {
  const absolute = path.isAbsolute(givenPath) ? givenPath : path.resolve(env.cwd, givenPath);
  return path.relative(store.root, absolute).split(path.sep).join('/');
}

/** publish spec: --entity resolves to the same backlink enumeration `ctxr rollup gather` uses. */
async function resolveEntityNotes(env: RunEnv, store: Store, entity: string): Promise<Note[]> {
  const relativePath = toStoreRelativePath(env, store, entity);
  if (!existsSync(path.join(store.root, relativePath))) throw new NoteNotFoundError(relativePath);

  const stem = path.basename(relativePath, '.md');
  const notes = await listNotes(store.root, store.config);
  return notes.filter((n) => n.path !== relativePath && extractLinkTargets(n.body).includes(stem));
}

/** publish spec: --as resolves to every note the named context's configured visible-values list admits. */
async function resolveContextNotes(store: Store, context: string): Promise<Note[]> {
  const notes = await listNotes(store.root, store.config);
  return notes.filter((note) => canSee(store.config, context, resolveVisibility(store.config, note).value));
}

async function resolveNoteSet(env: RunEnv, store: Store, flags: PublishGatherFlags): Promise<{ selector: PublishGatherData['selector']; subject: string; notes: Note[] }> {
  const given = (['under', 'note', 'entity', 'as'] as const).filter((key) => flags[key] !== undefined);
  if (given.length === 0) throw new PublishSelectorRequiredError();
  if (given.length > 1) throw new PublishSelectorConflictError(given.map((key) => `--${key}`));

  const selector = given[0]!;
  switch (selector) {
    case 'under': {
      const notes = await listNotes(store.root, store.config, { underPrefix: flags.under! });
      return { selector, subject: flags.under!, notes };
    }
    case 'note': {
      const relativePath = toStoreRelativePath(env, store, flags.note!);
      const absolutePath = path.join(store.root, relativePath);
      let note: Note;
      try {
        note = await parseNote(absolutePath, relativePath);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new NoteNotFoundError(relativePath);
        throw err;
      }
      return { selector, subject: relativePath, notes: [note] };
    }
    case 'entity': {
      const notes = await resolveEntityNotes(env, store, flags.entity!);
      return { selector, subject: flags.entity!, notes };
    }
    case 'as': {
      const notes = await resolveContextNotes(store, flags.as!);
      return { selector, subject: flags.as!, notes };
    }
  }
}

/**
 * publish spec: agent-facing enumeration-and-gate only, matching rollup
 * gather's shape — resolves a subject to its note set (one of four
 * selectors), evaluates every note through the same tri-state disclosure
 * evaluation `ctxr check <note> --audience <audience>` uses, and exits with
 * the aggregate (most-restrictive-member) verdict. It renders nothing;
 * building the page is the agent's and its craft skill's work.
 */
export async function execute(env: RunEnv, store: Store, flags: PublishGatherFlags): Promise<CommandOutcome<PublishGatherData>> {
  if (!flags.audience) throw new PublishAudienceRequiredError();

  const { selector, subject, notes } = await resolveNoteSet(env, store, flags);

  const entries: PublishGatherEntry[] = notes.map((note) => {
    const { verdict, rung } = evaluateDisclosure(store.config, note, flags.audience!);
    return { path: note.path, verdict, rung, leaks: scanNoteForLeaks(store.config, note) };
  });

  const verdict = worstVerdict(entries.map((e) => e.verdict));

  return {
    exitCode: VERDICT_EXIT_CODE[verdict] as ExitCode,
    data: { selector, subject, audience: flags.audience, count: entries.length, notes: entries, verdict },
    findings: [],
    humanSummary: `${entries.length} note(s) resolved for audience "${flags.audience}": aggregate ${verdict.toUpperCase()}`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
