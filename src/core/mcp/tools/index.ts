import { packagedTemplate } from '../../templates.js';
import type { ToolDefinition } from '../jsonrpc.js';
import type { Principal } from '../oauth.js';
import type { Mutex, WriteDeps } from '../sessions.js';
import type { McpView, SyncDeps } from '../sync.js';
import { asToolRefusal, capture, CAPTURE_INPUT_SCHEMA, parseCaptureArgs } from './capture.js';
import { EDIT_INPUT_SCHEMA, editTool, parseEditArgs, parseWriteArgs, WRITE_INPUT_SCHEMA, writeTool } from './edit.js';
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

/**
 * The remote surface's tool set and the prose that describes it
 * (templates/mcp/, shipped-prose-lives-in-templates). Built per request from
 * the server's current state. Reads go through `view.read`, so each sees one
 * commit and names it; writes go through the one mutex (design.md D9, D13).
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
}

/** Writes surface a WriteRefusal as a refusal the client model can read. */
async function writing<T>(ctx: ToolContext, fn: () => Promise<T>): Promise<T> {
  try {
    return await ctx.mutex.run(fn);
  } catch (err) {
    throw asToolRefusal(err);
  }
}

export function buildTools(ctx: ToolContext): ToolDefinition<Principal>[] {
  const read = <T extends object>(fn: (snapshot: Parameters<Parameters<McpView['read']>[1]>[0]) => Promise<T>) => ctx.view.read(ctx.syncDeps, fn);
  return [
    {
      name: 'find',
      title: 'Find in the store',
      description: packagedTemplate('mcp', 'find'),
      inputSchema: FIND_INPUT_SCHEMA,
      scope: 'read',
      readOnly: true,
      run: (args) => {
        const parsed = parseFindArgs(args);
        return read((snapshot) => find(snapshot, parsed, ctx.baseUrl));
      },
    },
    {
      name: 'gather',
      title: 'Gather related notes',
      description: packagedTemplate('mcp', 'gather'),
      inputSchema: GATHER_INPUT_SCHEMA,
      scope: 'read',
      readOnly: true,
      run: (args) => {
        const parsed = parseGatherArgs(args);
        return read((snapshot) => gatherWithBodies(snapshot, parsed));
      },
    },
    {
      name: 'Read',
      title: 'Read a file',
      description: packagedTemplate('mcp', 'Read'),
      inputSchema: READ_INPUT_SCHEMA,
      scope: 'read',
      readOnly: true,
      render: renderRead,
      run: (args, principal) => {
        const parsed = parseReadArgs(args);
        return read((snapshot) => readTool(snapshot, ctx.write, principal.email, parsed));
      },
    },
    {
      name: 'Grep',
      title: 'Search file contents',
      description: packagedTemplate('mcp', 'Grep'),
      inputSchema: GREP_INPUT_SCHEMA,
      scope: 'read',
      readOnly: true,
      render: renderGrep,
      run: (args) => {
        const parsed = parseGrepArgs(args);
        return read((snapshot) => grepTool(snapshot, parsed));
      },
    },
    {
      name: 'Glob',
      title: 'Find files by name',
      description: packagedTemplate('mcp', 'Glob'),
      inputSchema: GLOB_INPUT_SCHEMA,
      scope: 'read',
      readOnly: true,
      render: renderGlob,
      run: (args) => {
        const parsed = parseGlobArgs(args);
        return read((snapshot) => globTool(snapshot, parsed));
      },
    },
    {
      name: 'capture',
      title: 'Capture into the store',
      description: packagedTemplate('mcp', 'capture'),
      inputSchema: CAPTURE_INPUT_SCHEMA,
      scope: 'capture',
      readOnly: false,
      run: (args, principal) => {
        const parsed = parseCaptureArgs(args);
        return writing(ctx, () => capture({ view: ctx.view, syncDeps: ctx.syncDeps, write: ctx.write }, principal.email, parsed));
      },
    },
    {
      name: 'Edit',
      title: 'Edit a note',
      description: packagedTemplate('mcp', 'Edit'),
      inputSchema: EDIT_INPUT_SCHEMA,
      scope: 'edit',
      readOnly: false,
      run: (args, principal) => {
        const parsed = parseEditArgs(args);
        return writing(ctx, () => editTool({ view: ctx.view, syncDeps: ctx.syncDeps, write: ctx.write }, principal.email, parsed));
      },
    },
    {
      name: 'Write',
      title: 'Create a note',
      description: packagedTemplate('mcp', 'Write'),
      inputSchema: WRITE_INPUT_SCHEMA,
      scope: 'edit',
      readOnly: false,
      run: (args, principal) => {
        const parsed = parseWriteArgs(args);
        return writing(ctx, () => writeTool({ view: ctx.view, syncDeps: ctx.syncDeps, write: ctx.write }, principal.email, parsed));
      },
    },
  ];
}
