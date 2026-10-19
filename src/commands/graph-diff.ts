import { reviewServedAt, type ServedAtRoute } from '../core/browse/page-url.js';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { GraphDiffFormatError, GraphDiffSinceRequiredError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { createExecFileGitRunner } from '../core/git/exec.js';
import { renderKnowledgeChangesBlock, reviewLines } from '../core/graph/diff-block.js';
import { renderDiffDocument } from '../core/graph/diff-document.js';
import { computeGraphDelta, resolveRange, type GraphDelta } from '../core/graph/diff.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/** review-the-knowledge-diff (D9): an enum rather than a boolean, so a further form has room and `--json` stays the envelope switch. */
export const GRAPH_DIFF_FORMATS = ['text', 'markdown'] as const;
export type GraphDiffFormat = (typeof GRAPH_DIFF_FORMATS)[number];

export interface GraphDiffFlags {
  since: string | undefined;
  until: string | undefined;
  format: string | undefined;
}

export interface GraphDiffData extends GraphDelta {
  base_url_declared: boolean;
  /** The review view of this session worktree, carrying the head id; null outside a worktree or with previews off. */
  review: ServedAtRoute | null;
}

/**
 * The flag checks, ahead of any store or git read, so a malformed invocation
 * is refused with the usage code however the store is doing. Returns the
 * format to render.
 */
export function checkFlags(flags: GraphDiffFlags, jsonMode: boolean): GraphDiffFormat {
  if (flags.since === undefined) throw new GraphDiffSinceRequiredError();
  const format = flags.format ?? 'text';
  if (!(GRAPH_DIFF_FORMATS as readonly string[]).includes(format)) throw new GraphDiffFormatError(format, GRAPH_DIFF_FORMATS, false);
  if (format === 'markdown' && jsonMode) throw new GraphDiffFormatError(format, GRAPH_DIFF_FORMATS, true);
  return format as GraphDiffFormat;
}

/**
 * context-retrieval spec (review-the-knowledge-diff): the graph delta between
 * the merge base of `--since` and the head, read from git's object store. It
 * reports and gates nothing — no findings, and exit 0 whenever both sides
 * could be read (D10). `--format markdown` makes the human output the
 * knowledge-changes block and nothing else, so it can be pasted unchanged.
 */
export async function execute(store: Store, flags: GraphDiffFlags, jsonMode = false): Promise<CommandOutcome<GraphDiffData>> {
  const format = checkFlags(flags, jsonMode);
  const git = createExecFileGitRunner();
  const range = await resolveRange(git, store.root, flags.since!, flags.until);
  const delta = await computeGraphDelta(git, store.root, range, store.config);
  const review = reviewServedAt(store, delta.head);
  const baseUrlDeclared = store.config.serve?.base_url !== undefined;

  const humanSummary =
    format === 'markdown'
      ? renderKnowledgeChangesBlock(delta, review).replace(/\n$/, '')
      : [renderDiffDocument(delta).replace(/\n$/, ''), ...reviewLines(review)].join('\n');

  return {
    exitCode: ExitCode.Ok,
    data: { ...delta, base_url_declared: baseUrlDeclared, review },
    findings: [],
    humanSummary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
