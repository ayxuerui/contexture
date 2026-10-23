import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { readConfig } from '../../config/load.js';
import { MIGRATION_STEPS } from '../../config/migrations.js';
import * as doctorCommand from '../../commands/doctor.js';
import * as graphDiffCommand from '../../commands/graph-diff.js';
import { pageUrlsFor, type PageAddress, type PageUrlEntry } from '../../commands/publish-urls.js';
import { baseRef } from '../approval/sessions.js';
import { ForgeRequestError } from '../forge/github.js';
import type { Finding } from '../envelope.js';
import { ContextureError, SessionRefusedError } from '../errors.js';
import { ExitCode } from '../exit-codes.js';
import { hasRemote } from '../git/worktree.js';
import type { Store } from '../store.js';
import { packagedTemplate, substituteBlock } from '../templates.js';
import { commitStaged, type CommitOptions } from './commit.js';
import { firstLines, publishSession, remoteTip, SessionRemoteError, type PushOutcome, type RemoteDeps } from './remote.js';
import { commitsAhead, rebaseInProgress, type SessionRef } from './resolve.js';

/**
 * write-lifecycle spec (*`ctxr session submit` gates, commits, pushes and
 * opens the pull request*): the mechanical steps of `ctxr-submit` in one call,
 * shared by the CLI and the MCP surface (bring-the-session-lifecycle-into-the-cli
 * D1–D4). The gate is the same store-scope pass `ctxr doctor` runs; the
 * pre-commit and pre-push hooks stay the commit and default-branch gates.
 *
 * Each step leaves what it did in place when a later one fails, and every
 * remote step reads before it writes, so running the same submit again
 * finishes the job without a second commit or pull request.
 */
export interface SubmitInput {
  branch: string;
  message: string;
  title: string;
  /** The agent's own body: why, what changed, route, verification, follow-ups. */
  body: string;
}

export type SubmitStep = 'arguments' | 'staged' | 'gate' | 'commit' | 'branch' | 'push' | 'pull_request';

export interface SubmitSteps {
  /** The paths in the index when the gate ran, relative to the worktree's top level. */
  staged: string[];
  gate: 'pass';
  /** The new commit, or null when nothing was left to commit (a retry, or work already committed). */
  commit: string | null;
  branch: 'renamed' | 'kept';
  push: PushOutcome;
  pull_request: 'created' | 'updated' | 'found';
}

export interface SubmitResult {
  session: string;
  worktree: string;
  branch: string;
  /** The generated name the branch carried before this submit renamed it; null when it was kept. */
  renamed_from: string | null;
  head: string;
  steps: SubmitSteps;
  pull_request: { number: number; url: string };
  /** The approval page for the session, when the store declares change approval. */
  approval_url: string | null;
}

export interface SubmitDeps extends RemoteDeps {
  /** D4: the MCP surface's member identity; omitted, the clone's own identity commits. */
  commit?: Omit<CommitOptions, 'message'>;
}

/** A submit that stopped at a step; `details.step` names it and `details.completed` what ran before it. */
function stopped(exitCode: ExitCode, reason: string, step: SubmitStep, completed: Partial<SubmitSteps>, message: string, details: Record<string, unknown> = {}): SessionRefusedError {
  return new SessionRefusedError(exitCode, reason, message, { step, completed, ...details });
}

/** The generated sections' headings, as the templates that write them spell them. */
function generatedHeadings(): string[] {
  return [packagedTemplate('graph/knowledge-changes', 'block'), packagedTemplate('session/pages', 'block')].map((block) => block.split('\n')[0]!.replace(/^#+\s*/, ''));
}

/**
 * D2: the generated sections are the command's, so a body that already
 * carries either heading — as a markdown heading or a bold line — is refused
 * rather than appended to, and the section can be neither duplicated nor
 * hand-edited.
 */
function headingInBody(body: string): string | null {
  for (const heading of generatedHeadings()) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^\\s*(?:#{1,6}\\s+|\\*\\*)${escaped}(?:\\*\\*)?\\s*:?\\s*$`, 'im').test(body)) return heading;
  }
  return null;
}

function under(file: string, prefix: string): boolean {
  const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
  return file.startsWith(normalized);
}

async function openWorktreeStore(session: SessionRef): Promise<Store> {
  return { root: session.storeRoot, config: await readConfig(session.storeRoot, MIGRATION_STEPS) };
}

function show(address: PageAddress): string {
  return `\`${address.url ?? address.route}\``;
}

function fill(text: string, values: Readonly<Record<string, string>>): string {
  return Object.entries(values).reduce((out, [token, value]) => out.replaceAll(`__${token}__`, () => value), text);
}

/**
 * The Pages section, built from `ctxr publish urls`' report for the range —
 * every value copied from it, never rebuilt from a path — or null when the
 * report lists no page. The sentences are `templates/session/pages/`'s.
 */
export function renderPagesSection(pages: readonly PageUrlEntry[], base: string, baseUrlDeclared: boolean): string | null {
  if (pages.length === 0) return null;
  const template = (name: string): string => packagedTemplate('session/pages', name);
  const previews = pages.some((p) => p.preview !== null);
  const rows = pages.map((page) => {
    let published = page.status === 'removed' ? fill(template('stops-working'), { ADDRESS: show(page.published) }) : show(page.published);
    if (page.moved_from !== null) published = fill(template('moved'), { ADDRESS: published, PATH: page.moved_from.path, OLD: show(page.moved_from.published) });
    const cells = [`\`${page.path}\``, page.status, page.lifespan, ...(previews ? [page.preview === null ? '' : show(page.preview)] : []), published];
    return `| ${cells.join(' | ')} |`;
  });
  let text = template('block').replaceAll('__BASE__', () => base);
  text = substituteBlock(text, '__TABLE__', [...template(previews ? 'table-head-preview' : 'table-head').split('\n'), ...rows]);
  text = substituteBlock(text, '__CONDITION__', template(previews ? 'condition-preview' : 'condition').split('\n'));
  text = substituteBlock(text, '__BARE_ROUTE__', baseUrlDeclared ? [] : template('bare-route').split('\n'));
  return text;
}

/** D2: the body the pull request carries — the agent's, then the Pages section when there is one, then the Knowledge changes block verbatim. */
async function pullBody(session: SessionRef, base: string, body: string): Promise<string> {
  const store = await openWorktreeStore(session);
  const knowledge = (await graphDiffCommand.execute(store, { since: base, until: undefined, format: 'markdown' })).humanSummary;
  const pages = renderPagesSection(await pageUrlsFor(store, [`${base}...HEAD`]), base, store.config.serve?.base_url !== undefined);
  return [body.trim(), ...(pages === null ? [] : [pages]), knowledge].join('\n\n');
}

export function approvalAddress(config: Store['config'], name: string): string | null {
  if (config.change_approval === undefined) return null;
  const route = `/approve/${encodeURIComponent(name)}/`;
  const baseUrl = config.serve?.base_url;
  return baseUrl === undefined ? route : `${baseUrl.replace(/\/+$/, '')}${route}`;
}

async function checkBranchName(deps: SubmitDeps, session: SessionRef, wanted: string): Promise<void> {
  const { git } = deps;
  const refuse = (reason: string, message: string) => stopped(ExitCode.Usage, reason, 'arguments', {}, message, { branch: wanted });
  const format = await git.run(['check-ref-format', '--branch', wanted], { cwd: session.path, allowFailure: true });
  if (format.exitCode !== 0 || wanted.startsWith('-')) throw refuse('branch_invalid', `"${wanted}" is not a usable branch name.`);
  if (wanted === deps.config.git.default_branch) throw refuse('branch_is_default', `"${wanted}" is the default branch; a session is never pushed to it.`);
  if (wanted === session.branch) return;

  const local = await git.run(['rev-parse', '--verify', '--quiet', `refs/heads/${wanted}`], { cwd: session.path, allowFailure: true });
  if (local.exitCode === 0) throw refuse('branch_taken', `A branch named "${wanted}" already exists in this repository; give this session another name.`);
  if (await hasRemote(git, session.path)) {
    let onRemote: string | null = null;
    try {
      onRemote = await remoteTip(deps, session.path, wanted);
    } catch (err) {
      if (!(err instanceof SessionRemoteError)) throw err;
    }
    if (onRemote !== null) throw refuse('branch_taken', `The remote already has a branch named "${wanted}"; give this session another name.`);
  }
  // Renaming a branch whose pull request is open would strand that pull request and open a second one.
  let pulls;
  try {
    pulls = await deps.forge.pullsForHead(session.branch);
  } catch (err) {
    if (!(err instanceof ForgeRequestError)) throw err;
    throw stopped(ExitCode.CheckFailed, 'forge_unreachable', 'arguments', {}, `The forge could not be read to check "${session.branch}" for an open pull request before renaming it (${firstLines(err.message, 2)}); nothing was done.`);
  }
  const open = pulls.find((p) => p.state === 'open');
  if (open !== undefined) {
    throw refuse('branch_has_pull_request', `"${session.name}" already has pull request #${open.number} open on branch "${session.branch}"; submit it again with --branch "${session.branch}".`);
  }
}

export async function submitSession(deps: SubmitDeps, session: SessionRef, input: SubmitInput): Promise<SubmitResult> {
  const { git } = deps;
  const cwd = session.path;
  const run = (args: readonly string[]) => git.run(args, { cwd, allowFailure: true });

  for (const [name, value] of [['--message', input.message], ['--title', input.title], ['--body', input.body]] as const) {
    if (value.trim() === '') throw stopped(ExitCode.Usage, 'argument_empty', 'arguments', {}, `${name} cannot be empty.`);
  }
  const heading = headingInBody(input.body);
  if (heading !== null) {
    throw stopped(ExitCode.Usage, 'body_has_generated_section', 'arguments', {}, `The body carries a "${heading}" section, which \`ctxr session submit\` writes itself; leave it out of the body.`, { heading });
  }
  if (await rebaseInProgress(git, cwd)) {
    throw stopped(ExitCode.CheckFailed, 'rebase_in_progress', 'arguments', {}, `A rebase is in progress in "${session.name}"; finish it with \`ctxr session rebase ${session.name} --continue\` or undo it with \`ctxr session rebase ${session.name} --abort\`.`);
  }
  await checkBranchName(deps, session, input.branch);

  // Revision 2: the whole index, whoever staged it, is checked before anything is staged, so a refusal leaves it as it was.
  const prefix = (await git.run(['rev-parse', '--show-prefix'], { cwd: session.storeRoot })).stdout.trim();
  const derived = deps.config.derived.paths.map((p) => `${prefix}${p}`);
  const indexed = (await run(['diff', '--cached', '--name-status', '--no-renames', '-z'])).stdout.split('\0');
  const derivedStaged: string[] = [];
  for (let i = 0; i + 1 < indexed.length; i += 2) {
    if (indexed[i] !== 'D' && derived.some((d) => under(indexed[i + 1]!, d))) derivedStaged.push(indexed[i + 1]!);
  }
  if (derivedStaged.length > 0) {
    throw stopped(
      ExitCode.CheckFailed,
      'derived_path_staged',
      'staged',
      {},
      `${derivedStaged.map((p) => `"${p}"`).join(', ')} ${derivedStaged.length === 1 ? 'is' : 'are'} staged under a derived path, which is never committed; unstage ${derivedStaged.length === 1 ? 'it' : 'them'} with \`git restore --staged\` and submit again.`,
      { paths: derivedStaged },
    );
  }

  const added = await run(['add', '-A', '--', ':/', ...derived.map((d) => `:(top,exclude)${d}`)]);
  if (added.exitCode !== 0) throw stopped(ExitCode.CheckFailed, 'stage_failed', 'staged', {}, `The session's changes could not be staged: ${added.stderr.trim()}`);
  const staged = (await run(['diff', '--cached', '--name-only', '-z'])).stdout.split('\0').filter((p) => p !== '');
  const completed: Partial<SubmitSteps> = { staged };

  const base = await baseRef(git, cwd, deps.config.git.default_branch);
  if (staged.length === 0 && (await commitsAhead(git, cwd, base)) === 0) {
    throw stopped(ExitCode.CheckFailed, 'nothing_to_submit', 'staged', completed, `"${session.name}" has no changes and no commits ahead of ${base}, so there is nothing to submit.`);
  }

  // D1, point 2: the gate is doctor's own store-scope pass, run against the worktree — no second validator.
  // A store doctor cannot even read (a note with unparseable frontmatter) fails the gate as well.
  const doctor = await openWorktreeStore(session)
    .then((store) => doctorCommand.execute({ git }, store))
    .catch((err: unknown) => {
      if (err instanceof ContextureError) return { exitCode: err.exitCode, findings: [err.finding] };
      throw err;
    });
  if (doctor.exitCode !== ExitCode.Ok) {
    const errors: Finding[] = doctor.findings.filter((f) => f.severity === 'error');
    const listed = errors.slice(0, 5).map((f) => `${f.code}: ${f.message}`).join('; ');
    throw stopped(ExitCode.CheckFailed, 'gate_failed', 'gate', completed, `\`ctxr doctor\` fails in "${session.name}", so nothing was committed: ${listed}${errors.length > 5 ? ` (and ${errors.length - 5} more)` : ''}`, { findings: errors });
  }
  completed.gate = 'pass';

  completed.commit = null;
  if (staged.length > 0) {
    const committed = await commitStaged(git, cwd, deps.env, { ...deps.commit, message: input.message });
    if (committed.exitCode !== 0) {
      throw stopped(ExitCode.CheckFailed, 'commit_refused', 'commit', completed, `The commit was refused: ${`${committed.stdout}\n${committed.stderr}`.trim()}`);
    }
    completed.commit = (await run(['rev-parse', 'HEAD'])).stdout.trim();
  }

  let renamedFrom: string | null = null;
  if (input.branch !== session.branch) {
    const renamed = await run(['branch', '-m', input.branch]);
    if (renamed.exitCode !== 0) throw stopped(ExitCode.CheckFailed, 'rename_failed', 'branch', completed, `The branch could not be renamed to "${input.branch}": ${renamed.stderr.trim()}`);
    renamedFrom = session.branch;
  }
  completed.branch = renamedFrom === null ? 'kept' : 'renamed';
  const target = { path: cwd, branch: input.branch };

  let published;
  try {
    published = await publishSession(deps, target, { title: input.title, body: await pullBody(session, base, input.body) }, { update: true });
  } catch (err) {
    if (!(err instanceof SessionRemoteError)) throw err;
    throw stopped(
      ExitCode.CheckFailed,
      err.step === 'push' ? 'push_failed' : 'pull_request_failed',
      err.step,
      completed,
      `${err.step === 'push' ? `The branch "${input.branch}" could not be pushed` : 'The branch is pushed, but its pull request could not be opened or updated'} (${err.detail}). Everything before this step is in place; run the same submit again to finish.`,
    );
  }

  return {
    session: session.name,
    worktree: cwd,
    branch: input.branch,
    renamed_from: renamedFrom,
    head: (await run(['rev-parse', 'HEAD'])).stdout.trim(),
    steps: { staged, gate: 'pass', commit: completed.commit, branch: completed.branch, push: published.push, pull_request: published.pullRequest },
    pull_request: { number: published.pull.number, url: published.pull.url },
    approval_url: approvalAddress(deps.config, session.name),
  };
}

/** `--body-file`: the body read from a file, relative to `cwd`. */
export async function readBodyFile(cwd: string, file: string): Promise<string> {
  try {
    return await readFile(path.resolve(cwd, file), 'utf8');
  } catch (err) {
    throw stopped(ExitCode.Usage, 'body_file_unreadable', 'arguments', {}, `--body-file "${file}" cannot be read (${(err as NodeJS.ErrnoException).code ?? 'error'}).`, { file });
  }
}
