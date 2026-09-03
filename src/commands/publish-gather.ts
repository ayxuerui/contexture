import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError, PublishSelectorConflictError, PublishSelectorRequiredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { extractLinkTargets } from '../core/graph/model.js';
import { listNotes, type Note } from '../core/notes/list.js';
import { parseNote } from '../core/notes/parse.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishGatherFlags {
  under?: string;
  note?: string;
  entity?: string;
}

export interface PublishGatherEntry {
  path: string;
}

export interface PublishGatherData {
  selector: 'under' | 'note' | 'entity';
  subject: string;
  count: number;
  notes: PublishGatherEntry[];
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

async function resolveNoteSet(env: RunEnv, store: Store, flags: PublishGatherFlags): Promise<{ selector: PublishGatherData['selector']; subject: string; notes: Note[] }> {
  const given = (['under', 'note', 'entity'] as const).filter((key) => flags[key] !== undefined);
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
  }
}

/**
 * publish spec: agent-facing enumeration only, matching rollup gather's
 * shape — resolves a subject to its note set (one of three selectors) and
 * reports it. It gates nothing and renders nothing; judging what belongs in
 * a page is the agent's and its craft skill's work, and the mechanical
 * checks a finished page must pass live in `ctxr publish check`.
 */
export async function execute(env: RunEnv, store: Store, flags: PublishGatherFlags): Promise<CommandOutcome<PublishGatherData>> {
  const { selector, subject, notes } = await resolveNoteSet(env, store, flags);
  const entries: PublishGatherEntry[] = notes.map((note) => ({ path: note.path }));

  return {
    exitCode: ExitCode.Ok,
    data: { selector, subject, count: entries.length, notes: entries },
    findings: [],
    humanSummary: `${entries.length} note(s) resolved for "${subject}".`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
