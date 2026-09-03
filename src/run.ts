import { Command } from 'commander';
import * as catalogBuildCommand from './commands/catalog-build.js';
import * as catalogCheckCommand from './commands/catalog-check.js';
import * as catalogShowCommand from './commands/catalog-show.js';
import * as adaptersGenerateCommand from './commands/adapters-generate.js';
import * as adaptersWriteGateCommand from './commands/adapters-write-gate.js';
import * as archiveCommand from './commands/archive.js';
import * as doctorCommand from './commands/doctor.js';
import * as ingestCommand from './commands/ingest.js';
import * as lintCommand from './commands/lint.js';
import * as migrateCommand from './commands/migrate.js';
import * as contextGatherCommand from './commands/context-gather.js';
import * as graphBuildCommand from './commands/graph-build.js';
import * as entryAppendCommand from './commands/entry-append.js';
import * as graphQueryCommand from './commands/graph-query.js';
import * as initCommand from './commands/init.js';
import * as publishGatherCommand from './commands/publish-gather.js';
import * as publishCheckCommand from './commands/publish-check.js';
import * as publishNewCommand from './commands/publish-new.js';
import * as sessionCaptureCommand from './commands/session-capture.js';
import * as sessionListCommand from './commands/session-list.js';
import * as serveCommand from './commands/serve.js';
import * as sessionStartCommand from './commands/session-start.js';
import * as rollupGatherCommand from './commands/rollup-gather.js';
import * as rollupStaleCommand from './commands/rollup-stale.js';
import * as rollupWriteCommand from './commands/rollup-write.js';
import * as sourceAddAltCommand from './commands/source-add-alt.js';
import * as sourceCheckCommand from './commands/source-check.js';
import * as sourceHashCommand from './commands/source-hash.js';
import * as sourceStampCommand from './commands/source-stamp.js';
import type { CommandOutcome } from './core/command.js';
import type { Finding } from './core/envelope.js';
import { buildEnvelope } from './core/envelope.js';
import type { RunEnv } from './core/env.js';
import { ContextureError } from './core/errors.js';
import { ExitCode } from './core/exit-codes.js';
import { createReporter } from './core/reporter.js';
import { openStore } from './core/store.js';
import * as updateCommand from './commands/update.js';
import * as verifyCommand from './commands/verify.js';
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
/** Accumulates a repeatable option's values — commander keeps only the last without it. */
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export async function run(argv: readonly string[], env: RunEnv): Promise<ExitCode> {
  const program = new Command();
  program
    .name('ctxr')
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
    .option('--harness <ids>', 'comma-separated harness-generation adapters to target (claude-code, hermes-agent), or "none"')
    .action(async (cmdOpts: { profile?: string; taxonomy?: string; harness?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('init', runEnv, jsonMode, () =>
        initCommand.execute(runEnv, { root, profile: cmdOpts.profile, taxonomy: cmdOpts.taxonomy, harness: cmdOpts.harness }),
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

  const entryCommand = program.command('entry').description('structured writes into a fenced region');

  entryCommand
    .command('append <path>')
    .description('append a line into a contexture:<region> fenced region, creating it if absent')
    .requiredOption('--region <name>', 'the region name')
    .requiredOption('--text <text>', 'the line to append')
    .action(async (notePath: string, cmdOpts: { region: string; text: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('entry.append', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return entryAppendCommand.execute(runEnv, store, { path: notePath, region: cmdOpts.region, text: cmdOpts.text });
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
    .action(async (cmdOpts: { section: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('catalog.show', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return catalogShowCommand.execute(store, { section: cmdOpts.section });
      });
    });

  const contextCommand = program.command('context').description('the retrieval pass over the store');

  contextCommand
    .command('gather')
    .description('expand entry selectors through the built graph into a gloss-annotated, ordered candidate set — no query, no ranking')
    .option('--seed <path>', 'a note already in hand (repeatable)', collect, [] as string[])
    .option('--section <id>', 'every note a catalog section lists (repeatable)', collect, [] as string[])
    .option('--under <prefix>', 'every retrievable note under this path prefix (repeatable)', collect, [] as string[])
    .option('--entity <name>', 'every note linking to this entity (same enumeration as rollup gather; repeatable)', collect, [] as string[])
    .option('--hops <n>', 'how many graph hops to expand from the entry set', (v) => Number.parseInt(v, 10), 1)
    .option('--direction <dir>', 'expand along in, out, or both edge directions', 'both')
    .option('--type <name>', 'expand only along edges of one configured relation')
    .option('--max-notes <n>', 'cap the returned set; truncation is reported, never silent', (v) => Number.parseInt(v, 10))
    .action(async (cmdOpts: { seed: string[]; section: string[]; under: string[]; entity: string[]; hops: number; direction: string; type?: string; maxNotes?: number }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('context.gather', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return contextGatherCommand.execute(store, {
          seed: cmdOpts.seed,
          section: cmdOpts.section,
          under: cmdOpts.under,
          entity: cmdOpts.entity,
          hops: cmdOpts.hops,
          direction: cmdOpts.direction as 'in' | 'out' | 'both',
          type: cmdOpts.type,
          maxNotes: cmdOpts.maxNotes,
        });
      });
    });

  const graphCommand = program.command('graph').description('the wikilink graph derived from the store');

  graphCommand
    .command('build')
    .description('rebuild the graph artifact from every retrievable note')
    .option('--emit-records', 'also emit a stable per-note record list {id, path, gloss, hash}')
    .action(async (cmdOpts: { emitRecords?: boolean }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.build', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphBuildCommand.execute(store, { emitRecords: cmdOpts.emitRecords });
      });
    });

  const graphQueryCommandGroup = graphCommand.command('query').description('query the built graph');

  graphQueryCommandGroup
    .command('neighbors <node>')
    .description('list nodes reachable from <node> within --depth hops')
    .option('--depth <n>', 'hop count', (v) => Number.parseInt(v, 10), 1)
    .option('--direction <dir>', 'in, out, or both', 'both')
    .option('--type <name>', 'follow only edges of this type (a configured relation name, or link)')
    .action(
      async (
        node: string,
        cmdOpts: { depth: number; direction: 'in' | 'out' | 'both'; type?: string },
        cmd: Command,
      ) => {
        const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
        result = await runCommand('graph.query.neighbors', runEnv, jsonMode, async () => {
          const store = await openStore(runEnv, { root });
          return graphQueryCommand.executeNeighbors(store, {
            node,
            depth: cmdOpts.depth,
            direction: cmdOpts.direction,
            type: cmdOpts.type,
          });
        });
      },
    );

  graphQueryCommandGroup
    .command('path <from> <to>')
    .description('shortest path between two nodes, if one exists')
    .action(async (from: string, to: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.path', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executePath(store, { from, to });
      });
    });

  graphQueryCommandGroup
    .command('subgraph <ids...>')
    .description('the induced subgraph over the given node ids')
    .action(async (ids: string[], _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.subgraph', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executeSubgraph(store, { ids });
      });
    });

  graphQueryCommandGroup
    .command('hubs')
    .description('nodes with the most backlinks')
    .option('--top <n>', 'how many to list', (v) => Number.parseInt(v, 10), 10)
    .action(async (cmdOpts: { top: number }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.hubs', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executeHubs(store, { top: cmdOpts.top });
      });
    });

  graphQueryCommandGroup
    .command('clusters')
    .description('every positional cluster with its note count')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.clusters', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executeClusters(store, {});
      });
    });

  graphQueryCommandGroup
    .command('bridges')
    .description('notes that link into the most other clusters')
    .option('--top <n>', 'how many to list (default: the configured bridge limit)', (v) => Number.parseInt(v, 10))
    .action(async (cmdOpts: { top?: number }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.bridges', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executeBridges(store, { top: cmdOpts.top });
      });
    });

  graphQueryCommandGroup
    .command('orphans')
    .description('nodes with no links in or out')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('graph.query.orphans', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return graphQueryCommand.executeOrphans(store, {});
      });
    });

  program
    .command('ingest <path>')
    .description('stamp source-identity fields onto an inbox file, turning it into a note')
    .requiredOption('--source-type <type>', 'the kind of source this material came from')
    .requiredOption('--source-id <id>', 'a stable identifier for this specific source')
    .action(async (notePath: string, cmdOpts: { sourceType: string; sourceId: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('ingest', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return ingestCommand.execute(runEnv, store, {
          path: notePath,
          sourceType: cmdOpts.sourceType,
          sourceId: cmdOpts.sourceId,
        });
      });
    });

  const sourceCommand = program.command('source').description('source-identity dedupe, ahead of ingest');

  sourceCommand
    .command('hash <path>')
    .description('the canonicalized-content hash of a file')
    .action(async (notePath: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('source.hash', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sourceHashCommand.execute(runEnv, store, { path: notePath });
      });
    });

  sourceCommand
    .command('check <path>')
    .description('two-stage dedupe verdict: new, already-ingested, drift, alternate-source-match, or multiple-matches')
    .requiredOption('--source-id <id>', "the candidate material's source identifier")
    .action(async (notePath: string, cmdOpts: { sourceId: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('source.check', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sourceCheckCommand.execute(runEnv, store, { path: notePath, sourceId: cmdOpts.sourceId });
      });
    });

  sourceCommand
    .command('stamp <path>')
    .description('record source identity (and, by default, the current content hash) on a note directly')
    .requiredOption('--id <id>', 'the source identifier to record')
    .option('--hash <hash>', 'the content hash to record (default: computed from the note\'s current body)')
    .action(async (notePath: string, cmdOpts: { id: string; hash?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('source.stamp', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sourceStampCommand.execute(runEnv, store, { path: notePath, id: cmdOpts.id, hash: cmdOpts.hash });
      });
    });

  sourceCommand
    .command('add-alt <path>')
    .description('append an alternative source identity to an already-ingested note')
    .requiredOption('--id <id>', 'the alternative source identifier')
    .action(async (notePath: string, cmdOpts: { id: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('source.add-alt', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sourceAddAltCommand.execute(runEnv, store, { path: notePath, id: cmdOpts.id });
      });
    });

  program
    .command('lint')
    .description('health observations that never fail the run: orphans, broken links, uningested inbox material, catalog gaps')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('lint', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return lintCommand.execute(runEnv, store);
      });
    });

  program
    .command('archive <path>')
    .description('retire a note via a single tracked rename, reporting every note that links to it')
    .action(async (notePath: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('archive', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return archiveCommand.execute(runEnv, store, { path: notePath });
      });
    });

  const rollupCommand = program.command('rollup').description('agent-facing gather, then a deterministic fenced write');

  rollupCommand
    .command('gather <entity>')
    .description('enumerate candidate source notes (notes linking to <entity>) for a rollup')
    .action(async (entity: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('rollup.gather', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return rollupGatherCommand.execute(runEnv, store, { entity });
      });
    });

  rollupCommand
    .command('write <entity>')
    .description('write agent-authored rollup content into a fenced region on <entity>')
    .requiredOption('--content-file <path>', 'a file containing the rollup text to write')
    .action(async (entity: string, cmdOpts: { contentFile: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('rollup.write', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return rollupWriteCommand.execute(runEnv, store, { entity, contentFile: cmdOpts.contentFile });
      });
    });

  rollupCommand
    .command('stale')
    .description('list entity notes whose backlinks moved past their last rollup timestamp')
    .option('--for <entity>', 'check only this entity')
    .action(async (cmdOpts: { for?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('rollup.stale', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return rollupStaleCommand.execute(runEnv, store, { for: cmdOpts.for });
      });
    });

  const publishCommand = program.command('publish').description('turn store content into a shareable page');

  publishCommand
    .command('gather')
    .description('resolve a subject (--under/--note/--entity) to its note set')
    .option('--under <prefix>', 'every retrievable note under this path prefix')
    .option('--note <path>', 'exactly one note')
    .option('--entity <name>', 'every note linking to this entity (same enumeration as rollup gather)')
    .action(async (cmdOpts: { under?: string; note?: string; entity?: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('publish.gather', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return publishGatherCommand.execute(runEnv, store, {
          under: cmdOpts.under,
          note: cmdOpts.note,
          entity: cmdOpts.entity,
        });
      });
    });

  publishCommand
    .command('new <slug>')
    .description('scaffold a page folder with a sibling README — the slug may name a path of folders under the publish path — refusing a reserved or already-existing slug')
    .action(async (slug: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('publish.new', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return publishNewCommand.execute(store, { slug });
      });
    });

  publishCommand
    .command('check <path>')
    .description('the mechanized structural checks a published page must pass (no external references, viewport meta, print rule, provenance, sibling README, script syntax)')
    .action(async (pagePath: string, _cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('publish.check', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return publishCheckCommand.execute(store, { path: pagePath });
      });
    });

  const adaptersCommand = program.command('adapters').description('harness-generation and forge adapters');

  adaptersCommand
    .command('generate')
    .description('(re)generate every configured harness-generation adapter\'s output')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('adapters.generate', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return adaptersGenerateCommand.execute(runEnv, store);
      });
    });

  adaptersCommand
    .command('write-gate')
    .description('PreToolUse hook target: deny an edit under the store root outside the active session worktree')
    .action(async (_cmdOpts: object, cmd: Command) => {
      // Deliberately bypasses runCommand/the --json envelope: this speaks
      // Claude Code's own hook protocol (see adapters-write-gate.ts) on
      // stdout/exit code, not contexture's.
      const { runEnv, root } = deriveRunEnv(env, cmd);
      result = await adaptersWriteGateCommand.execute(runEnv, { root });
    });

  program
    .command('serve')
    .description('serve notes, catalog sections, the graph document, and published pages over HTTP (loopback by default), for reading in a browser')
    .option('--port <n>', 'port to bind (default: OS-assigned)', (v) => Number.parseInt(v, 10), 0)
    .option('--host <address>', 'address to bind — widening beyond the default exposes the server, with no requester filtering of its own, to whatever can reach that address', serveCommand.DEFAULT_HOST)
    .action(async (cmdOpts: { port: number; host: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('serve', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return serveCommand.execute(runEnv, store, { port: cmdOpts.port, host: cmdOpts.host });
      });
    });

  program
    .command('update')
    .description('bring every contexture-owned file in the store up to the installed version (docs, skills, hooks, adapter outputs)')
    .action(async (_cmdOpts: object, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('update', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return updateCommand.execute(runEnv, store);
      });
    });

  program
    .command('verify')
    .description('exercise core store operations end to end, from an environment with no harness-specific state')
    .option('--portable', 'the portability test: a retrieval query, a derived-artifact build, and following one skill')
    .action(async (cmdOpts: { portable?: boolean }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('verify', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return verifyCommand.execute(store, { portable: cmdOpts.portable });
      });
    });

  program
    .command('migrate')
    .description('apply every pending schema migration, bringing the store up to the current schema_version')
    .option('--dry-run', 'report the exact changes each pending migration would make, without applying them')
    .action(async (cmdOpts: { dryRun?: boolean }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('migrate', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return migrateCommand.execute(store, { dryRun: cmdOpts.dryRun });
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
    .command('capture')
    .description('apply an approved end-of-session capture proposal: create or append notes')
    .requiredOption('--proposal <path>', 'a YAML file of approved note items')
    .action(async (cmdOpts: { proposal: string }, cmd: Command) => {
      const { runEnv, jsonMode, root } = deriveRunEnv(env, cmd);
      result = await runCommand('session.capture', runEnv, jsonMode, async () => {
        const store = await openStore(runEnv, { root });
        return sessionCaptureCommand.execute(store, cmdOpts);
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
