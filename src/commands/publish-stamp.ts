import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { PublishPageNotFoundError, PublishStampRefusedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { listNotes } from '../core/notes/list.js';
import { lifespanOf } from '../core/publish/lifespan.js';
import { appendHashMarker, assessRepresentation, readReadme } from '../core/publish/represents.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface PublishStampFlags {
  /** The page folder, or any file in it (its index page or README). */
  path: string;
}

export interface PublishStampData {
  /** The page folder, store-relative. */
  path: string;
  /** The note the page represents, store-relative. */
  note: string;
  /** The represented note's current content hash. */
  hash: string;
  /**
   * `stamped`: this run wrote the marker. `current` / `stale`: a marker was
   * already there, matching or not, and nothing was written.
   */
  status: 'stamped' | 'current' | 'stale';
  /** The hash the existing marker records; null when this run wrote it. */
  recorded: string | null;
}

/**
 * two-kinds-of-published-page D5: records the represented note's content hash
 * as a `<!-- hash:… -->` marker on the README line holding the lead link —
 * once. A marker already there is never overwritten, so confirming a page
 * against a changed note takes reviewing it, removing the marker by hand, and
 * stamping again: the catalog gloss's discipline. A disposable page is frozen
 * and never stamped.
 */
export async function execute(store: Store, flags: PublishStampFlags): Promise<CommandOutcome<PublishStampData>> {
  const absolute = path.isAbsolute(flags.path) ? flags.path : path.resolve(store.root, flags.path);
  if (!existsSync(absolute)) throw new PublishPageNotFoundError(path.relative(store.root, absolute).split(path.sep).join('/'));
  const pageDirectory = statSync(absolute).isDirectory() ? absolute : path.dirname(absolute);
  const relativePage = path.relative(store.root, pageDirectory).split(path.sep).join('/');

  const lifespan = lifespanOf(`${relativePage}/README.md`, store.config.publish.path);
  if (lifespan === null) throw new PublishStampRefusedError(relativePage, 'not-a-page');
  if (lifespan === 'disposable') throw new PublishStampRefusedError(relativePage, 'disposable');

  const readmeAbsolute = path.join(pageDirectory, 'README.md');
  const readmeRelative = `${relativePage}/README.md`;
  const raw = await readReadme(readmeAbsolute);
  if (raw === null) throw new PublishStampRefusedError(relativePage, 'no-readme');

  const notes = await listNotes(store.root, store.config);
  const representation = assessRepresentation(raw, readmeRelative, notes);
  switch (representation.status) {
    case 'no-link':
      throw new PublishStampRefusedError(relativePage, 'no-link');
    case 'not-found':
      throw new PublishStampRefusedError(relativePage, 'not-found', representation.target);
    case 'ambiguous':
      throw new PublishStampRefusedError(relativePage, 'ambiguous', representation.candidates.join(', '));
  }

  const { note, hash } = representation;
  // `appendHashMarker` is the one guard against overwriting: it hands back an
  // already-marked line unchanged, and an unchanged line is never written.
  const lines = raw.split('\n');
  const leadLine = lines[representation.lead.line]!;
  const marked = appendHashMarker(leadLine, hash);
  let data: PublishStampData;
  let summary: string;
  if (marked !== leadLine) {
    lines[representation.lead.line] = marked;
    await writeFileAtomic(readmeAbsolute, lines.join('\n'));
    data = { path: relativePage, note, hash, status: 'stamped', recorded: null };
    summary = `Stamped "${readmeRelative}" with the hash of "${note}".`;
  } else if (representation.status === 'current') {
    data = { path: relativePage, note, hash, status: 'current', recorded: representation.hash };
    summary = `"${readmeRelative}" is already stamped and current against "${note}". Nothing written.`;
  } else {
    const recorded = representation.status === 'stale' ? representation.recorded : null;
    data = { path: relativePage, note, hash, status: 'stale', recorded };
    summary =
      `"${readmeRelative}" is stale: "${note}" has changed since it was stamped. Nothing written — ` +
      'review the page against the note, remove the marker, and stamp again.';
  }

  return {
    exitCode: ExitCode.Ok,
    data,
    findings: [],
    humanSummary: summary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
