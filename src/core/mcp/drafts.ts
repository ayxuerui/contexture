import { createHash } from 'node:crypto';
import { slugifySegment } from '../slug.js';
import { pullStateFor, repoPathOf, sessionsLabelled, type PullState, type Session, type WriteDeps } from './sessions.js';

/**
 * serve-the-store-over-mcp design.md D12–D13: where a member's draft lives.
 * One session per member, labelled `mcp-draft-<local part>-<8 hex of the
 * email>` — readable in the approval index, and distinct for two members
 * whose local parts slugify alike. `Read` uses it to show a member their own
 * pending change; `Edit` and `Write` use it to find the session to extend.
 */

export const DRAFT_LABEL_PREFIX = 'mcp-draft-';

export function draftLabel(email: string): string {
  const local = slugifySegment(email.split('@')[0] ?? 'member').slice(0, 20).replace(/-+$/, '') || 'member';
  const digest = createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 8);
  return `${DRAFT_LABEL_PREFIX}${local}-${digest}`;
}

export interface Draft {
  session: Session;
  state: PullState;
}

/** The member's draft on disk and what the forge says about it; null when there is none. */
export async function findDraft(deps: WriteDeps, email: string): Promise<Draft | null> {
  const label = draftLabel(email);
  const session = (await sessionsLabelled(deps, label)).find((s) => s.label === label);
  if (session === undefined) return null;
  return { session, state: await pullStateFor(deps, session.branch) };
}

/**
 * A file as the member's draft has committed it, when the draft's committed
 * tip changes or adds it; null otherwise. Read from the branch with
 * `git show`, never the working tree, so an edit in progress is never seen
 * half-applied (design.md D12).
 */
export async function draftVersion(deps: WriteDeps, draft: Draft, storeRelative: string): Promise<string | null> {
  if (draft.state.kind === 'merged' || draft.state.kind === 'closed-unmerged') return null;
  const repoPath = await repoPathOf(deps, storeRelative);
  const base = `refs/remotes/origin/${deps.config.git.default_branch}`;
  const changed = await deps.git.run(['diff', '--name-only', '--no-renames', `${base}...${draft.session.branch}`, '--', repoPath], { cwd: deps.canonicalRoot, allowFailure: true });
  if (changed.exitCode !== 0 || changed.stdout.trim() === '') return null;
  const shown = await deps.git.run(['show', `${draft.session.branch}:${repoPath}`], { cwd: deps.canonicalRoot, allowFailure: true });
  return shown.exitCode === 0 ? shown.stdout : null;
}
