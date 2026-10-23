import path from 'node:path';
import type { StoreConfig } from '../../config/schema.js';
import { DEFAULT_LOG_PATH } from '../../config/defaults.js';
import { isUnderAnyPrefix, isUnderPrefix } from '../fs/prefix.js';
import { admitsNotePath } from '../notes/list.js';
import { CONFIG_FILE_NAME } from '../root.js';
import { ToolRefusal } from './jsonrpc.js';

/**
 * serve-the-session-lifecycle-to-chat-apps D5: what the file tools and the
 * command runners may read and change, as predicates over a store-relative,
 * `/`-separated path. Kept free of any session or snapshot, so the file tools
 * over the served commit, the same tools inside a session, and `ctxr_write`'s
 * before- and after-run checks all ask the same question.
 */

/** The store's entry document, readable though it is not a note. */
export const ENTRY_DOCUMENT = 'AGENTS.md';

export type ProtectedReason = 'configuration' | 'git' | 'derived' | 'worktrees' | 'skills';

/**
 * D5, revision 7: the one protected-path predicate. Inside a session a member
 * may change what a local session may change except these: the configuration
 * (it grants MCP scopes), anything whose first segment begins with `.git` —
 * the hooks directory among them, because a commit in a session worktree runs
 * that worktree's hooks on the server — derived and cache paths, the
 * worktrees path, and the managed skills path, which `ctxr update` owns.
 * Null when the path may be changed.
 */
export function protectedReason(rel: string, config: StoreConfig): ProtectedReason | null {
  if (rel === CONFIG_FILE_NAME) return 'configuration';
  if ((rel.split('/')[0] ?? '').startsWith('.git')) return 'git';
  if (isUnderAnyPrefix(rel, config.derived.paths)) return 'derived';
  if (isUnderPrefix(rel, config.session.worktrees_path)) return 'worktrees';
  if (isUnderPrefix(rel, config.harness.skills_path)) return 'skills';
  return null;
}

const PROTECTED_WORDS: Record<ProtectedReason, string> = {
  configuration: 'the store configuration',
  git: "git's own files and the hooks directory, which a commit on the server would run",
  derived: 'a derived or cache path',
  worktrees: 'the session worktrees path',
  skills: 'the managed skills path',
};

export function protectedRefusal(rel: string, reason: ProtectedReason): ToolRefusal {
  return new ToolRefusal('mcp.path_protected', `"${rel}" is ${PROTECTED_WORDS[reason]}, which cannot be changed from here; change it in a local session.`, { path: rel, reason });
}

/** D5: the paths the owned skills read that are not notes: templates, house conventions, the mission, the log and the skills. */
export function widenedReadablePrefixes(config: StoreConfig): string[] {
  return [
    config.templates.path,
    config.harness.guidance_path,
    config.harness.skills_path,
    config.organize.log_path ?? DEFAULT_LOG_PATH,
    ...(config.organize.mission_path !== undefined ? [config.organize.mission_path] : []),
  ];
}

/** Never read or returned, whatever else applies: configuration, `.git`, derived paths and the worktrees path. */
export function neverReadablePrefixes(config: StoreConfig): string[] {
  return [CONFIG_FILE_NAME, '.git', ...config.derived.paths, config.session.worktrees_path];
}

/**
 * D5: hidden from the file tools. `retrieval.exclude_paths` stays hidden — it
 * is the operator's declared intent — except the capture tier, which `Read`
 * marks, and the widened readable set, which the skills need.
 */
export function hiddenPrefixes(config: StoreConfig): string[] {
  const captureRoot = config.ingest.capture_root.replace(/\/+$/, '');
  return [...config.retrieval.exclude_paths.filter((p) => p.replace(/\/+$/, '') !== captureRoot), ...neverReadablePrefixes(config)];
}

/** Whether `rel` is a path the file tools may name at all (a file or a directory to search). */
export function nameablePath(rel: string, config: StoreConfig): boolean {
  if (rel === '') return true;
  if (isUnderAnyPrefix(rel, neverReadablePrefixes(config))) return false;
  if (isUnderAnyPrefix(rel, widenedReadablePrefixes(config))) return true;
  return !isUnderAnyPrefix(rel, hiddenPrefixes(config));
}

/** What `Read` answers for, as one predicate: a note, a markdown capture, the entry document, or the widened set. Grep and Glob return nothing else. */
export function readablePath(rel: string, config: StoreConfig): boolean {
  if (!nameablePath(rel, config) || rel === '') return false;
  if (isUnderAnyPrefix(rel, widenedReadablePrefixes(config))) return true;
  if (admitsNotePath(rel, config) || rel === ENTRY_DOCUMENT) return true;
  return rel.endsWith('.md') && isUnderAnyPrefix(rel, [config.ingest.capture_root]);
}

/**
 * The exclusions ripgrep is given: the hidden prefixes that contain nothing in
 * the widened set. A hidden prefix that does contain some (the default
 * `.contexture/` holds the templates) is searched and filtered by
 * `readablePath` afterwards, because a later positive glob would turn
 * ripgrep's exclusions into an allowlist.
 */
export function searchExclusions(config: StoreConfig): string[] {
  const widened = widenedReadablePrefixes(config).map((p) => p.replace(/\/+$/, ''));
  return hiddenPrefixes(config).filter((hidden) => !widened.some((w) => isUnderPrefix(w, hidden)) || isUnderAnyPrefix(hidden, neverReadablePrefixes(config)));
}

/** A caller's path as a normalized store-relative one (a leading `/` names the store root); refused when it leaves the store. `''` is the root. */
export function normalizeStorePath(input: string): string {
  const cleaned = input.trim().replace(/\\/g, '/');
  const normalized = path.posix.normalize(`/${cleaned}`).replace(/^\/+/, '').replace(/\/+$/, '');
  if (normalized === '..' || normalized.startsWith('../') || cleaned.split('/').includes('..')) {
    throw new ToolRefusal('mcp.path_outside_store', `"${input}" is outside the store.`);
  }
  return normalized;
}
