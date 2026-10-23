import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { SessionRefusedError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { credentialsFor } from '../core/forge/credentials.js';
import { createGhForgeClient } from '../core/forge/github.js';
import { resolveSession } from '../core/session/resolve.js';
import { readBodyFile, submitSession, type SubmitResult } from '../core/session/submit.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface SessionSubmitOptions {
  session: string;
  branch: string;
  message: string;
  title: string;
  body?: string;
  bodyFile?: string;
}

/**
 * write-lifecycle spec (*`ctxr session submit` gates, commits, pushes and
 * opens the pull request*): the request to submit is the consent, as it was
 * when the skill ran `git push` and `gh pr create` itself, so the command adds
 * no prompt (bring-the-session-lifecycle-into-the-cli, proposal Non-goals).
 * Exit `0` with the pull request open, `3` when the gate or a later step
 * stopped it, `2` for a refused argument (design.md D3).
 */
export async function execute(env: RunEnv, store: Store, opts: SessionSubmitOptions): Promise<CommandOutcome<SubmitResult>> {
  if ((opts.body === undefined) === (opts.bodyFile === undefined)) {
    throw new SessionRefusedError(ExitCode.Usage, 'body_required', 'Give the pull request body with exactly one of --body or --body-file.', { step: 'arguments' });
  }
  const body = opts.body ?? (await readBodyFile(env.cwd, opts.bodyFile!));
  const session = await resolveSession(env.git, store.root, store.config, opts.session, env.cwd);
  const credentials = await credentialsFor(env, session.path);
  const forge = createGhForgeClient(session.path, credentials);
  const result = await submitSession({ git: env.git, config: store.config, credentials, forge, env: env.env }, session, {
    branch: opts.branch,
    message: opts.message,
    title: opts.title,
    body,
  });

  const lines = [`Pull request #${result.pull_request.number} (${result.steps.pull_request}) for "${result.branch}": ${result.pull_request.url}`];
  if (result.approval_url !== null) lines.push(`Approval page: ${result.approval_url}`);
  return {
    exitCode: ExitCode.Ok,
    data: result,
    findings: [],
    humanSummary: lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
