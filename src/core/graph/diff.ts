import type { StoreConfig } from '../../config/schema.js';
import { GraphDiffNoMergeBaseError, GraphDiffRefNotFoundError } from '../errors.js';
import { isStrictlyUnderPrefix, isUnderPrefix } from '../fs/prefix.js';
import { readFencedRegion } from '../fs/fenced-region.js';
import type { GitRunner } from '../git/exec.js';
import { SOURCES_FIELD } from '../ingest/identity.js';
import { hasRollupSection, ROLLUP_FENCE } from '../rollup.js';
import { buildGraphFromNotes, graphBuildOptions, type DanglingLink, type GraphBuildResult, type GraphEdge } from './model.js';
import { listNotesAtCommit, type CommitNote } from './tree.js';

/**
 * review-the-knowledge-diff: how the store's knowledge changed between two
 * commits — facts only, with no severity, score or ranking (D10). Every list
 * is sorted by path and then by its remaining fields, and nothing here reads
 * the clock, so the same two commits and configuration give the same value.
 */
export interface NoteRename {
  from: string;
  to: string;
}

export interface InboundChange {
  path: string;
  gained: string[];
  lost: string[];
  /** Whether the note carries a rollup region on the head side. */
  rollup: boolean;
}

export type RollupChange = 'added' | 'removed' | 'changed';

export interface RollupTouched {
  path: string;
  change: RollupChange;
}

export interface SourcesCited {
  path: string;
  cited: string[];
}

export interface GraphDeltaCounts {
  notes_added: number;
  notes_removed: number;
  notes_modified: number;
  notes_moved: number;
  notes_archived: number;
  links_added: number;
  links_removed: number;
  dangling_introduced: number;
  dangling_resolved: number;
  inbound_changed: number;
  rollups_touched: number;
  sources_cited: number;
}

export interface GraphDelta {
  /** The full id of the base commit: the merge base of `--since` and the head. */
  base: string;
  /** The full id of the head commit. */
  head: string;
  counts: GraphDeltaCounts;
  notes: { added: string[]; removed: string[]; modified: string[]; moved: NoteRename[]; archived: NoteRename[] };
  links: { added: GraphEdge[]; removed: GraphEdge[] };
  dangling: { introduced: DanglingLink[]; resolved: DanglingLink[] };
  inbound: InboundChange[];
  rollups: RollupTouched[];
  sources: SourcesCited[];
}

/** One side of the comparison: a commit, the notes it holds, and the graph built from them. */
export interface GraphSide {
  commit: string;
  notes: readonly CommitNote[];
  graph: GraphBuildResult;
}

/** A rename git's rename detection reported between the two commits, store-relative. */
export type RenameTable = readonly NoteRename[];

export function isEmptyDelta(delta: GraphDelta): boolean {
  return Object.values(delta.counts).every((count) => count === 0);
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function compareTuples(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = compareStrings(a[i]!, b[i]!);
    if (order !== 0) return order;
  }
  return a.length - b.length;
}

function sortBy<T>(items: T[], key: (item: T) => readonly string[]): T[] {
  return items.sort((a, b) => compareTuples(key(a), key(b)));
}

const edgeKey = (edge: GraphEdge): string => [edge.src, edge.dst, edge.type].join('\0');
const danglingKey = (link: DanglingLink): string => [link.from, link.target, link.reason].join('\0');

/** The rollup region's text, or null when the note has none. A malformed fence reads as its whole body, so any edit to it still shows. */
function rollupRegion(note: CommitNote | undefined): string | null {
  if (note === undefined || !hasRollupSection(note)) return null;
  try {
    return readFencedRegion(note.body, ROLLUP_FENCE).join('\n');
  } catch {
    return note.body;
  }
}

/** The provenance field's entries; a lone string is one entry, anything else none. */
function sourcesOf(note: CommitNote | undefined): string[] {
  const value = note?.frontmatter?.[SOURCES_FIELD];
  if (Array.isArray(value)) return value.map((entry) => String(entry));
  if (typeof value === 'string') return [value];
  return [];
}

function inboundOf(edges: Iterable<GraphEdge>): Map<string, Set<string>> {
  const inbound = new Map<string, Set<string>>();
  for (const edge of edges) {
    const sources = inbound.get(edge.dst) ?? new Set<string>();
    sources.add(edge.src);
    inbound.set(edge.dst, sources);
  }
  return inbound;
}

/**
 * review-the-knowledge-diff (D3): the delta between two built sides. Every
 * base-side path is carried through the moves and archives first, so a note
 * that moved with its links still resolving reports no link change, and edges
 * compare as distinct `(src, dst, type)` triples, so a link written twice
 * counts once.
 *
 * A rename into `organize.archive_destination` from outside it is an archive,
 * whether or not the destination is admitted; any other rename between two
 * admitted paths is a move. A rename that leaves the admitted set is a removal
 * and one that enters it is an addition, which is what each side shows.
 */
export function diffGraphs(base: GraphSide, head: GraphSide, renames: RenameTable, config: StoreConfig): GraphDelta {
  const baseNotes = new Map(base.notes.map((note) => [note.path, note]));
  const headNotes = new Map(head.notes.map((note) => [note.path, note]));
  const destination = config.organize.archive_destination;

  const moved: NoteRename[] = [];
  const archived: NoteRename[] = [];
  for (const rename of renames) {
    if (!baseNotes.has(rename.from)) continue;
    if (isStrictlyUnderPrefix(rename.to, destination) && !isUnderPrefix(rename.from, destination)) archived.push(rename);
    else if (headNotes.has(rename.to)) moved.push(rename);
  }

  const forward = new Map<string, string>([...moved, ...archived].map((rename) => [rename.from, rename.to]));
  const backward = new Map<string, string>([...moved, ...archived].map((rename) => [rename.to, rename.from]));
  const mapPath = (basePath: string): string => forward.get(basePath) ?? basePath;
  const baseOf = (headPath: string): CommitNote | undefined => baseNotes.get(backward.get(headPath) ?? headPath);

  const mappedBasePaths = new Set(base.notes.map((note) => mapPath(note.path)));
  const added = head.notes.map((note) => note.path).filter((notePath) => !mappedBasePaths.has(notePath));
  const removed = base.notes
    .map((note) => note.path)
    .filter((notePath) => !forward.has(notePath) && !headNotes.has(notePath));
  const modified = head.notes
    .filter((note) => mappedBasePaths.has(note.path) && baseOf(note.path)!.blob !== note.blob)
    .map((note) => note.path);

  const baseEdges = new Map<string, GraphEdge>();
  for (const edge of base.graph.edges) {
    const mapped = { src: mapPath(edge.src), dst: mapPath(edge.dst), type: edge.type };
    baseEdges.set(edgeKey(mapped), mapped);
  }
  const headEdges = new Map(head.graph.edges.map((edge) => [edgeKey(edge), { ...edge }]));
  const linksAdded = [...headEdges].filter(([key]) => !baseEdges.has(key)).map(([, edge]) => edge);
  const linksRemoved = [...baseEdges].filter(([key]) => !headEdges.has(key)).map(([, edge]) => edge);

  const baseDangling = new Map(
    base.graph.dangling.map((link) => {
      const mapped = { ...link, from: mapPath(link.from) };
      return [danglingKey(mapped), mapped] as const;
    }),
  );
  const headDangling = new Map(head.graph.dangling.map((link) => [danglingKey(link), { ...link }] as const));
  const introduced = [...headDangling].filter(([key]) => !baseDangling.has(key)).map(([, link]) => link);
  // A dangling link that left with its note was removed, not resolved: only a source still present can resolve one.
  const resolved = [...baseDangling]
    .filter(([key, link]) => !headDangling.has(key) && headNotes.has(link.from))
    .map(([, link]) => link);

  const baseInbound = inboundOf(baseEdges.values());
  const headInbound = inboundOf(headEdges.values());
  const inbound: InboundChange[] = [];
  for (const target of new Set([...baseInbound.keys(), ...headInbound.keys()])) {
    const before = baseInbound.get(target) ?? new Set<string>();
    const after = headInbound.get(target) ?? new Set<string>();
    const gained = [...after].filter((source) => !before.has(source)).sort(compareStrings);
    const lost = [...before].filter((source) => !after.has(source)).sort(compareStrings);
    if (gained.length === 0 && lost.length === 0) continue;
    const headNote = headNotes.get(target);
    inbound.push({ path: target, gained, lost, rollup: headNote !== undefined && hasRollupSection(headNote) });
  }

  const rollups: RollupTouched[] = [];
  for (const note of head.notes) {
    const before = rollupRegion(baseOf(note.path));
    const after = rollupRegion(note);
    if (before === after) continue;
    rollups.push({ path: note.path, change: before === null ? 'added' : after === null ? 'removed' : 'changed' });
  }
  for (const note of base.notes) {
    if (headNotes.has(mapPath(note.path)) || rollupRegion(note) === null) continue;
    rollups.push({ path: note.path, change: 'removed' });
  }

  const sources: SourcesCited[] = [];
  for (const notePath of [...added, ...modified]) {
    const before = new Set(sourcesOf(baseOf(notePath)));
    const cited = [...new Set(sourcesOf(headNotes.get(notePath)))].filter((entry) => !before.has(entry)).sort(compareStrings);
    if (cited.length > 0) sources.push({ path: notePath, cited });
  }

  const delta: GraphDelta = {
    base: base.commit,
    head: head.commit,
    counts: {
      notes_added: added.length,
      notes_removed: removed.length,
      notes_modified: modified.length,
      notes_moved: moved.length,
      notes_archived: archived.length,
      links_added: linksAdded.length,
      links_removed: linksRemoved.length,
      dangling_introduced: introduced.length,
      dangling_resolved: resolved.length,
      inbound_changed: inbound.length,
      rollups_touched: rollups.length,
      sources_cited: sources.length,
    },
    notes: {
      added: added.sort(compareStrings),
      removed: removed.sort(compareStrings),
      modified: modified.sort(compareStrings),
      moved: sortBy(moved, (r) => [r.from, r.to]),
      archived: sortBy(archived, (r) => [r.from, r.to]),
    },
    links: {
      added: sortBy(linksAdded, (e) => [e.src, e.dst, e.type]),
      removed: sortBy(linksRemoved, (e) => [e.src, e.dst, e.type]),
    },
    dangling: {
      introduced: sortBy(introduced, (d) => [d.from, d.target, d.reason]),
      resolved: sortBy(resolved, (d) => [d.from, d.target, d.reason]),
    },
    inbound: sortBy(inbound, (i) => [i.path]),
    rollups: sortBy(rollups, (r) => [r.path, r.change]),
    sources: sortBy(sources, (s) => [s.path]),
  };
  return delta;
}

/** The full id of the commit `ref` names, or the error naming it. */
export async function resolveCommit(git: GitRunner, cwd: string, ref: string, flag: '--since' | '--until'): Promise<string> {
  const result = await git.run(['rev-parse', '--verify', '--quiet', '--end-of-options', `${ref}^{commit}`], { cwd, allowFailure: true });
  if (result.exitCode !== 0) throw new GraphDiffRefNotFoundError(flag, ref);
  return result.stdout.trim();
}

/**
 * review-the-knowledge-diff (D1): the head is `until` (HEAD when absent) and
 * the base is the merge base of `since` and the head — the `<ref>...HEAD`
 * meaning `publish urls --since` uses, so both pull-request sections describe
 * one change set. A base id and a head id that descends from it resolve back
 * to themselves, which is what makes the reported range re-runnable.
 */
export async function resolveRange(
  git: GitRunner,
  cwd: string,
  since: string,
  until: string | undefined,
): Promise<{ base: string; head: string }> {
  const sinceCommit = await resolveCommit(git, cwd, since, '--since');
  const head = await resolveCommit(git, cwd, until ?? 'HEAD', '--until');
  const result = await git.run(['merge-base', sinceCommit, head], { cwd, allowFailure: true });
  if (result.exitCode !== 0) throw new GraphDiffNoMergeBaseError(since, until ?? 'HEAD');
  return { base: result.stdout.trim(), head };
}

/**
 * review-the-knowledge-diff (D3): git's renames between the two commits, with
 * every knob that could change them pinned on the command line, so a user's
 * `diff.renames`, `diff.renameLimit`, external diff driver or textconv filter
 * cannot change the report. `--relative` makes the paths store-relative for a
 * store rooted below the repository's top level.
 */
export async function readRenames(git: GitRunner, storeRoot: string, base: string, head: string): Promise<NoteRename[]> {
  const { stdout } = await git.run(
    [
      '-c', 'diff.renameLimit=0',
      '-c', 'diff.renames=true',
      'diff', '--name-status', '-z', '--relative', '-M50%', '--no-ext-diff', '--no-textconv',
      base, head, '--',
    ],
    { cwd: storeRoot },
  );
  const fields = stdout.split('\0');
  const renames: NoteRename[] = [];
  for (let i = 0; i < fields.length; i++) {
    const code = fields[i]!;
    if (code === '') continue;
    if (code.startsWith('R') || code.startsWith('C')) {
      if (code.startsWith('R')) renames.push({ from: fields[i + 1]!, to: fields[i + 2]! });
      i += 2;
      continue;
    }
    i += 1;
  }
  return renames;
}

async function readSide(git: GitRunner, storeRoot: string, commit: string, config: StoreConfig): Promise<GraphSide> {
  const notes = await listNotesAtCommit(git, storeRoot, commit, config);
  return { commit, notes, graph: buildGraphFromNotes(notes, graphBuildOptions(config)) };
}

/**
 * Both sides read from git's object store under the CURRENT configuration
 * (D2), so a path that configuration excludes appears on neither side. No
 * checkout, no stash, and nothing written — the per-checkout graph artifact is
 * neither read nor rebuilt.
 */
export async function computeGraphDelta(
  git: GitRunner,
  storeRoot: string,
  range: { base: string; head: string },
  config: StoreConfig,
): Promise<GraphDelta> {
  const [base, head, renames] = await Promise.all([
    readSide(git, storeRoot, range.base, config),
    readSide(git, storeRoot, range.head, config),
    readRenames(git, storeRoot, range.base, range.head),
  ]);
  return diffGraphs(base, head, renames, config);
}
