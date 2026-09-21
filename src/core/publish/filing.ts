import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { PUBLISH_INDEX_FILE } from '../browse/routes.js';
import { extractLinkTargets } from '../graph/model.js';
import { parseNoteText } from '../notes/parse.js';
import { slugifyPath, slugifySegment } from '../slug.js';

/** What names the page's subject: the folder its notes live in, plus the note itself when a note names it. */
export interface FilingSubject {
  /** Store-relative, `/`-separated, unslugified. Empty when the subject names the store root. */
  directory: string;
  /** The subject note's filename stem. Absent for a subtree subject, which names no note. */
  noteStem?: string;
}

export interface FilingMove {
  from: string;
  to: string;
  /** Which of the two signals counted the page as the subject's — the evidence a caller reads before moving a URL. */
  matched_by: 'readme-link' | 'page-name';
}

export interface Filing {
  /** Publish-relative: the leading segments of a `ctxr publish new` slug. `null` when nothing names the subject. */
  prefix: string | null;
  /** Store-relative: the configured publish path joined onto `prefix`. `null` for the same reason. */
  path: string | null;
  /** The slugified store folder path alone, before any subject segment. `null` when the subject names the store root. */
  group: string | null;
  /** The segment naming the subject note, present only when D3 inserts one. */
  subject_segment: string | null;
  moves: FilingMove[];
}

/**
 * Re-exported from `core/slug.ts`, which owns the one normalization rule; the
 * filing module was where it was first written and is still where most callers
 * expect to find it.
 */
export { slugifyPath, slugifySegment };

/** A published page is a directory holding an index page — the same definition the browsing surface uses. */
async function pageDirectoriesIn(absoluteDirectory: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(absoluteDirectory, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }

  // A directory without an index page is a grouping node, not a page (the same
  // reading `publishPages` gives the published-pages tree).
  return entries
    .filter((entry) => entry.isDirectory() && existsSync(path.join(absoluteDirectory, entry.name, PUBLISH_INDEX_FILE)))
    .map((entry) => entry.name);
}

/**
 * D4: the FIRST note the README links, not merely one it links. A page's
 * README leads with the note it is a representation of and cites the rest
 * after it, so "links it at all" counts every page that so much as mentions
 * the subject among its sources — on a real store that claimed three unrelated
 * pages for one note, and each of those would have been a proposed move of a
 * URL somebody holds. A false negative leaves a page where it is; a false
 * positive asks for a broken link. The rule is chosen to fail in the cheap
 * direction.
 */
async function readmeLeadsWithStem(absolutePageDirectory: string, stem: string): Promise<boolean> {
  const readmePath = path.join(absolutePageDirectory, 'README.md');
  let raw: string;
  try {
    raw = await readFile(readmePath, 'utf8');
  } catch {
    return false;
  }
  // Parsed rather than grepped so frontmatter is excluded, matching how
  // `publish check` reads the same file and how the graph resolves a wikilink.
  // `extractLinkTargets` reports occurrences in body order, so [0] is the lead.
  return extractLinkTargets(parseNoteText(raw, readmePath).body)[0] === stem;
}

/**
 * design.md D4: the two directories this derivation ever files into, and no
 * others. Scanning `<group>/` recursively would count a DEEPER store folder's
 * pages as this subject's — precisely the mistake a full-depth mirror exists to
 * stop making.
 *
 * Two signals, union: the page's own directory segment equals the subject's
 * slugified stem, or its sibling README LEADS with the subject note (the same
 * stem rule `--entity` resolves a wikilink by). The first costs nothing and
 * covers the one failure the second has — a page named for its subject whose
 * README source-notes section was never filled in.
 *
 * Both failure directions are real and neither is gated. A README that leads
 * with something other than its subject is not counted, so the subject quietly
 * ends up with two pages in the folder path. The mitigation for the other
 * direction is structural rather than heuristic — this reports evidence and
 * moves nothing, so a false positive costs a reading, never a broken link.
 */
interface SubjectPage {
  /** Publish-relative directory the page sits directly in; `''` at the publish root. */
  directory: string;
  /** The page's own final segment. */
  page: string;
  matched_by: FilingMove['matched_by'];
}

async function pagesForNote(publishRoot: string, group: string, subjectSlug: string, noteStem: string): Promise<SubjectPage[]> {
  const subjectDirectory = group === '' ? subjectSlug : `${group}/${subjectSlug}`;

  const found: SubjectPage[] = [];
  for (const directory of new Set(subjectSlug === '' ? [group] : [group, subjectDirectory])) {
    const absolute = directory === '' ? publishRoot : path.join(publishRoot, ...directory.split('/'));
    for (const page of await pageDirectoriesIn(absolute)) {
      if (subjectSlug !== '' && slugifySegment(page) === subjectSlug) {
        found.push({ directory, page, matched_by: 'page-name' });
      } else if (await readmeLeadsWithStem(path.join(absolute, page), noteStem)) {
        found.push({ directory, page, matched_by: 'readme-link' });
      }
    }
  }
  return found;
}

/**
 * design.md D2: the group folder comes from the SELECTOR, never from where the
 * resolved notes live. The deepest common ancestor of a real store's resolved
 * set collapses to the store root — a page cites the role, the person, and
 * three reference notes — which would name no folder at all, file the page flat
 * at the publish root, and make `publish check` fail a page this command had
 * just told the author to create.
 *
 * D3: the segment naming the subject note is inserted exactly when that subject
 * already has a page, so a one-page subject stays shallow and a multi-page one
 * collects; and when the folder path is empty, so a subject at the store root
 * still yields a path one level deep and satisfies `checkPageLocation`'s floor
 * by construction.
 */
export async function deriveFiling(storeRoot: string, publishPath: string, subject: FilingSubject): Promise<Filing> {
  const publishPrefix = publishPath.split(path.sep).join('/').replace(/\/+$/, '');
  const publishRoot = path.join(storeRoot, ...publishPrefix.split('/'));
  const group = slugifyPath(subject.directory);

  if (subject.noteStem === undefined) {
    // A subtree subject names no note, so it can never gain a subject segment
    // and never needs the scan (D4).
    if (group === '') return { prefix: null, path: null, group: null, subject_segment: null, moves: [] };
    return { prefix: group, path: `${publishPrefix}/${group}`, group, subject_segment: null, moves: [] };
  }

  const subjectSlug = slugifySegment(subject.noteStem);
  const existing = await pagesForNote(publishRoot, group, subjectSlug, subject.noteStem);
  const carriesSegment = existing.length > 0 || group === '';

  if (!carriesSegment) {
    return { prefix: group, path: `${publishPrefix}/${group}`, group, subject_segment: null, moves: [] };
  }

  if (subjectSlug === '') {
    // Nothing names the subject: neither a folder path nor a usable stem.
    return { prefix: null, path: null, group: group === '' ? null : group, subject_segment: null, moves: [] };
  }

  const prefix = group === '' ? subjectSlug : `${group}/${subjectSlug}`;
  const moves: FilingMove[] = existing
    .filter((page) => page.directory !== prefix)
    .map((page) => ({
      from: `${page.directory === '' ? '' : `${page.directory}/`}${page.page}`,
      to: `${prefix}/${page.page}`,
      matched_by: page.matched_by,
    }));

  return { prefix, path: `${publishPrefix}/${prefix}`, group: group === '' ? null : group, subject_segment: subjectSlug, moves };
}
