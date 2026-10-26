import { packagedTemplate } from '../../templates.js';
import { packagedCliEntry } from '../cli-runner.js';
import type { ToolAnnotations, ToolDefinition } from '../jsonrpc.js';
import type { Principal } from '../oauth.js';
import { asToolRefusal, type Mutex, type WriteDeps } from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';
import { TOOL_REGISTRY } from '../tool-map.js';
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

export function serverInstructions(storeName: string): string {
  return packagedTemplate('mcp', 'server-instructions').replaceAll('__STORE_NAME__', storeName);
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

export function buildTools(ctx: ToolContext): ToolDefinition<Principal>[] {
  const read = <T extends object>(fn: (snapshot: Parameters<Parameters<McpView['read']>[1]>[0]) => Promise<T>) => ctx.view.read(ctx.syncDeps, fn);
  const writing = <T>(fn: () => Promise<T>): Promise<T> => refusing(() => ctx.mutex.run(fn));
  const files = { view: ctx.view, syncDeps: ctx.syncDeps, write: ctx.write };
  const cli = { ...files, entry: ctx.cliEntry ?? packagedCliEntry(), timeoutMs: ctx.cliTimeoutMs };
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
  };

  const unregistered = Object.keys(implementations).filter((name) => !TOOL_REGISTRY.some((t) => t.name === name));
  const unimplemented = TOOL_REGISTRY.filter((t) => implementations[t.name] === undefined).map((t) => t.name);
  if (unregistered.length > 0 || unimplemented.length > 0) {
    throw new Error(`the MCP tool registry and its implementations differ: unregistered ${unregistered.join(', ') || 'none'}; unimplemented ${unimplemented.join(', ') || 'none'}`);
  }
  return TOOL_REGISTRY.map((entry) => ({ name: entry.name, ...implementations[entry.name]! }));
}
