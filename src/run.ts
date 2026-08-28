import { Command } from 'commander';
import * as doctorCommand from './commands/doctor.js';
import * as initCommand from './commands/init.js';
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
 * Every registered command name, for tests to iterate over — so a later
 * phase's command automatically gets json-envelope-conformance coverage the
 * moment it's added here, rather than needing someone to remember to add a
 * new test file for it.
 */
export const COMMAND_NAMES = ['init', 'doctor'] as const;

interface CommanderErrorLike {
  code: string;
}

function isCommanderError(err: unknown): err is CommanderErrorLike {
  return typeof err === 'object' && err !== null && 'code' in err && typeof (err as CommanderErrorLike).code === 'string';
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
      const globalOpts = cmd.optsWithGlobals<{ root?: string; json?: boolean; input?: boolean }>();
      const jsonMode = Boolean(globalOpts.json);
      const runEnv: RunEnv = { ...env, noInput: env.noInput || globalOpts.input === false || jsonMode };
      result = await runCommand('init', runEnv, jsonMode, () =>
        initCommand.execute(runEnv, { root: globalOpts.root, profile: cmdOpts.profile, taxonomy: cmdOpts.taxonomy }),
      );
    });

  program
    .command('doctor')
    .description('check the store for real invariant violations')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals<{ root?: string; json?: boolean; input?: boolean }>();
      const jsonMode = Boolean(globalOpts.json);
      const runEnv: RunEnv = { ...env, noInput: env.noInput || globalOpts.input === false || jsonMode };
      result = await runCommand('doctor', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root: globalOpts.root });
        return doctorCommand.execute(store);
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
