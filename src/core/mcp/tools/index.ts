import { RELATION_DIRECTEDNESS_NOTE, RELATION_VOCABULARY } from '../../../config/defaults.js';
import type { StoreConfig } from '../../../config/schema.js';
import { CLI_VERSION } from '../../../version.js';
import { placeholderName, STORE_PLACEHOLDERS } from '../../skill-placeholders.js';
import { packagedTemplate, substituteBlock } from '../../templates.js';
import { packagedCliEntry } from '../cli-runner.js';
import type { ToolAnnotations, ToolDefinition } from '../jsonrpc.js';
import type { Principal } from '../oauth.js';
import { asToolRefusal, type Mutex, type WriteDeps } from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';
import { SECOND_OPINION_SCOPE, SECOND_OPINION_TOOL_NAMES, TOOL_REGISTRY } from '../tool-map.js';
import { capture, CAPTURE_INPUT_SCHEMA, parseCaptureArgs } from './capture.js';
import { CTXR_INPUT_SCHEMA, CTXR_WRITE_INPUT_SCHEMA, ctxrTool, ctxrWriteTool, parseCliArgs, renderCli } from './cli.js';
import {
  DELETE_INPUT_SCHEMA,
  deleteTool,
  EDIT_INPUT_SCHEMA,
  editTool,
  MOVE_INPUT_SCHEMA,
  moveTool,
  parseDeleteArgs,
  parseEditArgs,
  parseMoveArgs,
  parseWriteArgs,
  WRITE_INPUT_SCHEMA,
  writeTool,
} from './edit.js';
import {
  GLOB_INPUT_SCHEMA,
  globTool,
  GREP_INPUT_SCHEMA,
  grepTool,
  parseGlobArgs,
  parseGrepArgs,
  parseReadArgs,
  READ_INPUT_SCHEMA,
  readTool,
  renderGlob,
  renderGrep,
  renderRead,
} from './files.js';
import { find, FIND_INPUT_SCHEMA, parseFindArgs } from './find.js';
import { GATHER_INPUT_SCHEMA, gatherWithBodies, parseGatherArgs } from './gather.js';
import {
  parseCritiqueArgs,
  parsePollArgs,
  parsePreflightArgs,
  parseResultArgs,
  renderSecondOpinion,
  SECOND_OPINION_CRITIQUE_INPUT_SCHEMA,
  SECOND_OPINION_POLL_INPUT_SCHEMA,
  SECOND_OPINION_PREFLIGHT_INPUT_SCHEMA,
  SECOND_OPINION_RESULT_INPUT_SCHEMA,
  secondOpinionTool,
  type SecondOpinionArgs,
  type SecondOpinionToolContext,
} from './second-opinion.js';
import {
  SESSION_DISCARD_INPUT_SCHEMA,
  SESSION_LIST_INPUT_SCHEMA,
  SESSION_REBASE_INPUT_SCHEMA,
  SESSION_START_INPUT_SCHEMA,
  SESSION_STATUS_INPUT_SCHEMA,
  SESSION_SUBMIT_INPUT_SCHEMA,
  sessionDiscardTool,
  sessionListTool,
  sessionRebaseTool,
  sessionStartTool,
  sessionStatusTool,
  sessionSubmitTool,
} from './sessions.js';

/**
 * The remote surface's tool set and the prose that describes it
 * (templates/mcp/, shipped-prose-lives-in-templates). Built per request from
 * the server's current state. Reads of the served commit go through
 * `view.read`, so each sees one commit and names it; every write goes through
 * the one mutex (serve-the-store-over-mcp design.md D9, D13).
 *
 * serve-the-session-lifecycle-to-chat-apps D8, D9 and revision 6: the
 * registry is `tool-map.ts`'s — this module supplies each listed tool's
 * implementation and annotations, and refuses to build when the two differ.
 */

/**
 * The instructions `initialize` returns, rendered from the configuration the
 * server last loaded. publish-one-contexture-plugin D2: their *This store*
 * section gives every placeholder the skills of the general plugin name, by
 * the label `skill-placeholders.ts` gives both, with this store's value, then
 * the layers, the relation vocabulary and the server's ctxr version.
 */
export function serverInstructions(storeName: string, config: StoreConfig, scopes: readonly string[] = ['read', SECOND_OPINION_SCOPE]): string {
  // offer-the-second-opinion-on-its-own D4: the store section is for a member who may read the store.
  if (!scopes.includes('read')) return secondOpinionInstructions(storeName);
  const values = STORE_PLACEHOLDERS.map((p) => `- \`${placeholderName(p)}\`: \`${p.value(config)}\``);
  const layers = config.taxonomy.layers.length === 0 ? ['- none'] : config.taxonomy.layers.map((layer) => `- **${layer.name}** (\`${layer.path.replace(/\/*$/, '/')}\`): ${layer.description}`);
  const relations = [...RELATION_VOCABULARY.map((relation) => `- **${relation.name}**: ${relation.definition}`), '', RELATION_DIRECTEDNESS_NOTE];
  let text = packagedTemplate('mcp', 'server-instructions');
  // A reader the store's own list leaves out is not told of tools the connector does not list for them.
  text = scopes.includes(SECOND_OPINION_SCOPE) ? substituteBlock(text, '__SECOND_OPINION__', [secondOpinionParagraph()]) : text.replace('__SECOND_OPINION__\n\n', '');
  text = substituteBlock(text, '__STORE_VALUES__', values);
  text = substituteBlock(text, '__STORE_LAYERS__', layers);
  text = substituteBlock(text, '__RELATION_VOCABULARY__', relations);
  return text.replaceAll('__STORE_NAME__', storeName).replaceAll('__CLI_VERSION__', CLI_VERSION);
}

const secondOpinionParagraph = (): string => packagedTemplate('mcp', 'second-opinion-instructions').trim();

/**
 * offer-the-second-opinion-on-its-own D4 (remote-access spec, *The server
 * instructions give this store's values*): what a member without `read` is
 * told, and all the server with no store says. The server's name, its ctxr
 * version and how the four tools are used: no path, layer or other value of
 * a store.
 */
export function secondOpinionInstructions(serverName: string): string {
  const text = substituteBlock(packagedTemplate('mcp', 'server-instructions-second-opinion'), '__SECOND_OPINION__', [secondOpinionParagraph()]);
  return text.replaceAll('__SERVER_NAME__', serverName).replaceAll('__CLI_VERSION__', CLI_VERSION);
}

export interface ToolContext {
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
  mutex: Mutex;
  /** `serve.base_url` from the loaded configuration. */
  baseUrl: string | undefined;
  /** The CLI entry `ctxr` and `ctxr_write` spawn; this package's own by default. */
  cliEntry?: string;
  /** The runners' time bound, when a caller (a test) needs a different one. */
  cliTimeoutMs?: number;
  /** The second opinion's own bound, likewise (serve-the-second-opinion-to-chat-apps D3). */
  secondOpinionTimeoutMs?: number;
  /** The longest `second-opinion result` wait, likewise (second-opinion-start-and-fetch D6). */
  secondOpinionMaxWaitSeconds?: number;
}

/** D8: changes nothing; asking twice answers the same. */
const READ_ONLY: ToolAnnotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
/** D8: changes a session or the forge, reviewably: nothing it does is lost or lands without a decision. */
const WRITES: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };
/** D8: removes work. */
const DESTRUCTIVE: ToolAnnotations = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };

/** A refusal from the core or the write side, readable by the client model; writes one at a time. */
async function refusing<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw asToolRefusal(err);
  }
}

type Implementation = Omit<ToolDefinition<Principal>, 'name'>;

/** A second opinion is neither read-only nor a write to the store: it starts model runs, and asking twice asks twice. */
const STARTS_A_RUN: ToolAnnotations = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false };

/**
 * offer-the-second-opinion-on-its-own D2, D7: the four second-opinion tools,
 * built from what they use alone, so `ctxr serve` and the server with no
 * store offer the same four. They run outside the view's lock and the write
 * mutex: the CLI's own lock keeps runs one at a time.
 */
export function secondOpinionImplementations(ctx: SecondOpinionToolContext): Record<string, Implementation> {
  const prose = (name: string) => packagedTemplate('mcp', name);
  const tool = (name: string, title: string, inputSchema: Record<string, unknown>, parse: (args: Record<string, unknown>) => SecondOpinionArgs, annotations: ToolAnnotations): Implementation => ({
    title,
    description: prose(name),
    inputSchema,
    scope: SECOND_OPINION_SCOPE,
    annotations,
    render: renderSecondOpinion,
    run: (args, principal) => {
      const parsed = parse(args);
      return refusing(() => secondOpinionTool(ctx, principal.email, parsed));
    },
  });
  return {
    second_opinion_preflight: tool('second_opinion_preflight', 'Check the second-opinion critics', SECOND_OPINION_PREFLIGHT_INPUT_SCHEMA, parsePreflightArgs, STARTS_A_RUN),
    second_opinion_critique: tool('second_opinion_critique', 'Get a second opinion on a plan', SECOND_OPINION_CRITIQUE_INPUT_SCHEMA, parseCritiqueArgs, STARTS_A_RUN),
    second_opinion_poll: tool('second_opinion_poll', 'Poll three models on a question', SECOND_OPINION_POLL_INPUT_SCHEMA, parsePollArgs, STARTS_A_RUN),
    second_opinion_result: tool('second_opinion_result', 'Fetch a second opinion', SECOND_OPINION_RESULT_INPUT_SCHEMA, parseResultArgs, READ_ONLY),
  };
}

/** The tool set of the server with no store: the four second-opinion tools, in registry order. */
export function buildSecondOpinionTools(ctx: SecondOpinionToolContext): ToolDefinition<Principal>[] {
  const implementations = secondOpinionImplementations(ctx);
  return SECOND_OPINION_TOOL_NAMES.map((name) => ({ name, ...implementations[name]! }));
}

export function buildTools(ctx: ToolContext): ToolDefinition<Principal>[] {
  const read = <T extends object>(fn: (snapshot: Parameters<Parameters<McpView['read']>[1]>[0]) => Promise<T>) => ctx.view.read(ctx.syncDeps, fn);
  const writing = <T>(fn: () => Promise<T>): Promise<T> => refusing(() => ctx.mutex.run(fn));
  const files = { view: ctx.view, syncDeps: ctx.syncDeps, write: ctx.write };
  const cli = { ...files, entry: ctx.cliEntry ?? packagedCliEntry(), timeoutMs: ctx.cliTimeoutMs };
  // second-opinion-lineup-in-store-config D5: the lineup is the served commit's, never a session's working copy.
  const secondOpinion: SecondOpinionToolContext = {
    entry: cli.entry,
    env: ctx.write.env,
    lineupSource: () => ctx.view.read(ctx.syncDeps, async (snapshot) => ({ storeRoot: snapshot.store.root })),
    timeoutMs: ctx.secondOpinionTimeoutMs,
    maxWaitSeconds: ctx.secondOpinionMaxWaitSeconds,
  };
  const prose = (name: string) => packagedTemplate('mcp', name);

  const implementations: Record<string, Implementation> = {
    find: {
      title: 'Find in the store',
      description: prose('find'),
      inputSchema: FIND_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      run: (args) => {
        const parsed = parseFindArgs(args);
        return read((snapshot) => find(snapshot, parsed, ctx.baseUrl));
      },
    },
    gather: {
      title: 'Gather related notes',
      description: prose('gather'),
      inputSchema: GATHER_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      run: (args) => {
        const parsed = parseGatherArgs(args);
        return read((snapshot) => gatherWithBodies(snapshot, parsed));
      },
    },
    Read: {
      title: 'Read a file',
      description: prose('Read'),
      inputSchema: READ_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      render: renderRead,
      run: (args, principal) => refusing(() => readTool(files, principal.email, parseReadArgs(args))),
    },
    Grep: {
      title: 'Search file contents',
      description: prose('Grep'),
      inputSchema: GREP_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      render: renderGrep,
      run: (args, principal) => refusing(() => grepTool(files, principal.email, parseGrepArgs(args))),
    },
    Glob: {
      title: 'Find files by name',
      description: prose('Glob'),
      inputSchema: GLOB_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      render: renderGlob,
      run: (args, principal) => refusing(() => globTool(files, principal.email, parseGlobArgs(args))),
    },
    capture: {
      title: 'Capture into the store',
      description: prose('capture'),
      inputSchema: CAPTURE_INPUT_SCHEMA,
      scope: 'capture',
      annotations: WRITES,
      run: (args, principal) => {
        const parsed = parseCaptureArgs(args);
        return writing(() => capture(files, principal.email, parsed));
      },
    },
    session_start: {
      title: 'Start a session',
      description: prose('session_start'),
      inputSchema: SESSION_START_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => writing(() => sessionStartTool(ctx.write, principal.email, args)),
    },
    session_list: {
      title: 'List your sessions',
      description: prose('session_list'),
      inputSchema: SESSION_LIST_INPUT_SCHEMA,
      scope: 'edit',
      annotations: READ_ONLY,
      run: (_args, principal) => refusing(() => sessionListTool(ctx.write, principal.email)),
    },
    session_status: {
      title: 'Re-scan a session',
      description: prose('session_status'),
      inputSchema: SESSION_STATUS_INPUT_SCHEMA,
      scope: 'edit',
      annotations: READ_ONLY,
      run: (args, principal) => refusing(() => sessionStatusTool(ctx.write, principal.email, args)),
    },
    Edit: {
      title: 'Edit a file in a session',
      description: prose('Edit'),
      inputSchema: EDIT_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => {
        const parsed = parseEditArgs(args);
        return writing(() => editTool(ctx.write, principal.email, parsed));
      },
    },
    Write: {
      title: 'Create a file in a session',
      description: prose('Write'),
      inputSchema: WRITE_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => {
        const parsed = parseWriteArgs(args);
        return writing(() => writeTool(ctx.write, principal.email, parsed));
      },
    },
    Move: {
      title: 'Move a file in a session',
      description: prose('Move'),
      inputSchema: MOVE_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => {
        const parsed = parseMoveArgs(args);
        return writing(() => moveTool(ctx.write, principal.email, parsed));
      },
    },
    Delete: {
      title: 'Delete a file in a session',
      description: prose('Delete'),
      inputSchema: DELETE_INPUT_SCHEMA,
      scope: 'edit',
      annotations: DESTRUCTIVE,
      run: (args, principal) => {
        const parsed = parseDeleteArgs(args);
        return writing(() => deleteTool(ctx.write, principal.email, parsed));
      },
    },
    session_submit: {
      title: 'Submit a session for approval',
      description: prose('session_submit'),
      inputSchema: SESSION_SUBMIT_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => writing(() => sessionSubmitTool(ctx.write, principal.email, args)),
    },
    session_rebase: {
      title: 'Rebase a session',
      description: prose('session_rebase'),
      inputSchema: SESSION_REBASE_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      run: (args, principal) => writing(() => sessionRebaseTool(ctx.write, principal.email, args)),
    },
    session_discard: {
      title: 'Discard a session',
      description: prose('session_discard'),
      inputSchema: SESSION_DISCARD_INPUT_SCHEMA,
      scope: 'edit',
      annotations: DESTRUCTIVE,
      run: (args, principal) => writing(() => sessionDiscardTool(ctx.write, principal.email, args)),
    },
    ctxr: {
      title: 'Run a read-only ctxr command',
      description: prose('ctxr'),
      inputSchema: CTXR_INPUT_SCHEMA,
      scope: 'read',
      annotations: READ_ONLY,
      render: renderCli,
      run: (args, principal) => {
        const parsed = parseCliArgs(args, false);
        return refusing(() => ctxrTool(cli, principal.email, parsed));
      },
    },
    ctxr_write: {
      title: 'Run a writing ctxr command in a session',
      description: prose('ctxr_write'),
      inputSchema: CTXR_WRITE_INPUT_SCHEMA,
      scope: 'edit',
      annotations: WRITES,
      render: renderCli,
      run: (args, principal) => {
        const parsed = parseCliArgs(args, true);
        return writing(() => ctxrWriteTool(cli, principal.email, parsed));
      },
    },
    ...secondOpinionImplementations(secondOpinion),
  };

  const unregistered = Object.keys(implementations).filter((name) => !TOOL_REGISTRY.some((t) => t.name === name));
  const unimplemented = TOOL_REGISTRY.filter((t) => implementations[t.name] === undefined).map((t) => t.name);
  if (unregistered.length > 0 || unimplemented.length > 0) {
    throw new Error(`the MCP tool registry and its implementations differ: unregistered ${unregistered.join(', ') || 'none'}; unimplemented ${unimplemented.join(', ') || 'none'}`);
  }
  return TOOL_REGISTRY.map((entry) => ({ name: entry.name, ...implementations[entry.name]! }));
}
