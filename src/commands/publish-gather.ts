import { existsSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { NoteNotFoundError, PublishSelectorConflictError, PublishSelectorRequiredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { extractLinkTargets } from '../core/graph/model.js';
import { listNotes, type Note } from '../core/notes/list.js';
import { parseNote } from '../core/notes/parse.js';
import { deriveFiling, type Filing, type FilingSubject } from '../core/publish/filing.js';
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
  /** Where a page for this subject belongs — derive-the-page-filing-path. Reported, never enforced. */
  filing: Filing;
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

/**
 * derive-the-page-filing-path design.md D2: the subject a page is filed under
 * is what the SELECTOR names, never where the notes it resolved to happen to
 * live. A real store's page cites the role, the person, and three reference
 * notes, so their deepest common ancestor is the store root — which names no
 * folder, and would file the page flat at a location `publish check` then
 * fails.
 */
function filingSubjectFor(selector: PublishGatherData['selector'], subject: string): FilingSubject {
  if (selector === 'under') return { directory: subject.replace(/\/+$/, '') };
  return { directory: path.dirname(subject) === '.' ? '' : path.dirname(subject), noteStem: path.basename(subject, '.md') };
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
      // The store-relative form, not the argument as typed: the filing path is
      // derived from the directory holding this note, so both must agree on it.
      return { selector, subject: toStoreRelativePath(env, store, flags.entity!), notes };
    }
  }
}

/**
 * D5: names the `publish new` form of the path and never the store-relative
 * one — passing the store-relative form to `publish new` would file the page
 * under the configured publish path twice, and both forms are one field apart
 * in the JSON.
 */
function filingSummary(filing: Filing): string {
  if (filing.prefix === null) {
    return 'Page filing: none derives — no folder path names this subject.';
  }
  const collected = filing.subject_segment === null ? '' : ', collected under the segment naming the subject';
  const moves = filing.moves.length === 0 ? '' : `; ${filing.moves.length} existing page(s) belong there too`;
  return `Page filing: ${filing.prefix}/<page-name>${collected}${moves}.`;
}

/**
 * D3/D5: worded conditionally on purpose. This command also runs against a
 * subject that already has exactly one page and is not acquiring another, where
 * the honest sentence is "belongs there once a second page exists", not "must
 * move". Names the matching signal so the caller reads the evidence before
 * touching a URL, and says outright that the URL changes.
 */
function moveNotice(move: { from: string; to: string; matched_by: string }): string {
  const evidence = move.matched_by === 'readme-link' ? 'its README links the subject note' : 'its own folder name is the subject';
  return `filing: "${move.from}" belongs at "${move.to}" once a second page for this subject exists (counted because ${evidence}). Moving it changes a URL already handed out — do it deliberately and name the change to the operator.`;
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
  const filing = await deriveFiling(store.root, store.config.publish.path, filingSubjectFor(selector, subject));

  return {
    exitCode: ExitCode.Ok,
    data: { selector, subject, count: entries.length, notes: entries, filing },
    findings: [],
    humanSummary: `${entries.length} note(s) resolved for "${subject}". ${filingSummary(filing)}`,
    notices: filing.moves.map(moveNotice),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
