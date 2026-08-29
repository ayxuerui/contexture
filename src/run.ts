import { Command } from 'commander';
import * as catalogBuildCommand from './commands/catalog-build.js';
import * as catalogCheckCommand from './commands/catalog-check.js';
import * as catalogShowCommand from './commands/catalog-show.js';
import * as doctorCommand from './commands/doctor.js';
import * as initCommand from './commands/init.js';
import * as noteResolveCommand from './commands/note-resolve.js';
import * as sessionAbandonCommand from './commands/session-abandon.js';
import * as sessionListCommand from './commands/session-list.js';
import * as sessionReapCommand from './commands/session-reap.js';
import * as sessionStartCommand from './commands/session-start.js';
import * as sessionSubmitCommand from './commands/session-submit.js';
import type { CommandOutcome } from './core/command.js';
import type { Finding } from './core/envelope.js';
import { buildEnvelope } from './core/envelope.js';
import type { RunEnv } from './core/env.js';
import { ContextureError } from './core/errors.js';
import { ExitCode } from './core/exit-codes.js';
import { createReporter } from './core/reporter.js';
import { openStore } from './core/store.js';
import { CLI_VERSION } from './version.js';

/**
 * Every registered top-level command name (excluding subcommand groups like
 * `note`), for tests to iterate over — so a later phase's command
 * automatically gets json-envelope-conformance coverage the moment it's
 * added here.
 */
export const COMMAND_NAMES = ['init', 'doctor'] as const;

interface GlobalOpts {
  root?: string;
  json?: boolean;
  input?: boolean;
}

interface CommanderErrorLike {
  code: string;
}

function isCommanderError(err: unknown): err is CommanderErrorLike {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as CommanderErrorLike).code === 'string';
}

/** Merges parent-command globals (--root/--json/--no-input) with the current command's own RunEnv. */
function deriveRunEnv(env: RunEnv, cmd: Command): { runEnv: RunEnv; jsonMode: boolean; root: string | undefined } {
  const globalOpts = cmd.optsWithGlobals<GlobalOpts>();
  const jsonMode = Boolean(globalOpts.json);
  const runEnv: RunEnv = { ...env, noInput: env.noInput || globalOpts.input === false || jsonMode };
  return { runEnv, jsonMode, root: globalOpts.root };
}

/**
 * Every command's shared preamble and postamble: run `body`, map a thrown
 * ContextureError (or, failing that, any unexpected error) to the right
 * exit code, build the --json envelope, and emit through Reporter exactly
 * once. This is the ONE place that mapping happens — no command implements
 * its own error-to-envelope translation.
 */
async function runCommand<TData>(
  commandName: string,
  env: RunEnv,
  jsonMode: boolean,
  body: () => Promise<CommandOutcome<TData>>,
): Promise<ExitCode> {
  const reporter = createReporter(env.io, jsonMode);
  try {
    const outcome = await body();
    const envelope = buildEnvelope({
      cliVersion: CLI_VERSION,
      command: commandName,
      storeRoot: outcome.storeRoot,
      schemaVersion: outcome.schemaVersion,
      findings: outcome.findings,
      data: outcome.data,
      exitCode: outcome.exitCode,
    });
    reporter.emitResult(envelope, outcome.humanSummary);
    return outcome.exitCode;
  } catch (err) {
    if (err instanceof ContextureError) {
      const envelope = buildEnvelope({
        cliVersion: CLI_VERSION,
        command: commandName,
        storeRoot: null,
        schemaVersion: null,
        findings: [err.finding],
        data: null,
        exitCode: err.exitCode,
      });
      reporter.emitResult(envelope, `error: ${err.finding.message}`);
      return err.exitCode;
    }
    const message = err instanceof Error ? err.message : String(err);
    const finding: Finding = { code: 'internal_error', severity: 'error', message };
    const envelope = buildEnvelope({
      cliVersion: CLI_VERSION,
      command: commandName,
      storeRoot: null,
      schemaVersion: null,
      findings: [finding],
      data: null,
      exitCode: ExitCode.Internal,
    });
    reporter.emitResult(envelope, `error: ${message}`);
    return ExitCode.Internal;
  }
}

/**
 * The one testable seam for the whole CLI: given argv and an injected
 * RunEnv, returns the exit code it would have produced — no process-global
 * mutation, no real subprocess required for a unit test.
 */
export async function run(argv: readonly string[], env: RunEnv): Promise<ExitCode> {
  const program = new Command();
  program
    .name('contexture')
    .exitOverride()
    .configureOutput({
      writeOut: (str: string) => env.io.stderr.write(str),
      writeErr: (str: string) => env.io.stderr.write(str),
    })
    .option('--root <path>', 'store root (overrides CONTEXTURE_ROOT)')
    .option('--json', 'emit machine-readable output')
    .option('--no-input', 'never prompt; fail loud instead of blocking');

  let result: ExitCode = ExitCode.Ok;

  program
    .command('init')
    .description('create a new context store, or reconcile an existing one')
    .option('--profile <id>', 'shipped taxonomy profile id (para, zettelkasten, diataxis)')
    .option('--taxonomy <path>', 'path to a custom taxonomy definition file')
    .action(async (cmdOpts: { profile?: string; taxonomy?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('init', runEnv, jsonMode, () =>
        initCommand.execute(runEnv, { root, profile: cmdOpts.profile, taxonomy: cmdOpts.taxonomy }),
      );
    });

  program
    .command('doctor')
    .description('check the store for real invariant violations')
    .option('--staged', 'check staged changes only (used by the pre-commit hook)')
    .action(async (cmdOpts: { staged?: boolean }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('doctor', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return doctorCommand.execute(runEnv, store, { staged: cmdOpts.staged });
      });
    });

  const noteCommand = program.command('note').description('inspect a single note');
  noteCommand
    .command('resolve <path>')
    .description("resolve a note's visibility field and report why")
    .action(async (notePath: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('note.resolve', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return noteResolveCommand.execute(runEnv, store, { path: notePath });
      });
    });

  const catalogCommand = program.command('catalog').description('the curated, coverage-guaranteed note catalog');

  catalogCommand
    .command('build')
    .description('regenerate every catalog section, preserving authored glosses')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('catalog.build', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return catalogBuildCommand.execute(store);
      });
    });

  catalogCommand
    .command('check')
    .description('verify catalog coverage (and, with --stale, flag entries needing gloss review)')
    .option('--stale', 'also report entries whose note has changed since the gloss was confirmed')
    .action(async (cmdOpts: { stale?: boolean }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('catalog.check', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return catalogCheckCommand.execute(store, { stale: cmdOpts.stale });
      });
    });

  catalogCommand
    .command('show')
    .description('print one catalog section')
    .requiredOption('--section <id>', 'the section id to print')
    .option('--as <context>', 'filter by resolved visibility (wired in Phase 5)')
    .action(async (cmdOpts: { section: string; as?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('catalog.show', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return catalogShowCommand.execute(store, { section: cmdOpts.section, as: cmdOpts.as });
      });
    });

  const sessionCommand = program.command('session').description('manage session worktrees');

  sessionCommand
    .command('start')
    .description('create a new session worktree off a freshly fetched default branch')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.start', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionStartCommand.execute(runEnv, store);
      });
    });

  sessionCommand
    .command('submit')
    .description('validate, commit, push, and open a pull request for the current session')
    .option('--message <text>', 'commit message for any remaining staged changes')
    .option('--title <text>', 'pull request title')
    .option('--body <text>', 'pull request body')
    .action(async (cmdOpts: { message?: string; title?: string; body?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.submit', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionSubmitCommand.execute(runEnv, store, cmdOpts);
      });
    });

  sessionCommand
    .command('abandon <branch>')
    .description('discard a session: remove its worktree and delete its branch')
    .action(async (branch: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.abandon', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionAbandonCommand.execute(runEnv, store, { branch });
      });
    });

  sessionCommand
    .command('list')
    .description('list active session worktrees')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.list', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionListCommand.execute(runEnv, store);
      });
    });

  sessionCommand
    .command('reap')
    .description('reclaim merged, clean session worktrees')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.reap', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionReapCommand.execute(runEnv, store);
      });
    });

  try {
    await program.parseAsync(argv as string[], { from: 'user' });
  } catch (err) {
    if (isCommanderError(err)) {
      if (err.code === 'commander.helpDisplayed' || err.code === 'commander.version') {
        return ExitCode.Ok;
      }
      env.io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
      return ExitCode.Usage;
    }
    throw err;
  }

  return result;
}
