import { packagedTemplate } from '../../templates.js';
import type { ToolDefinition } from '../jsonrpc.js';
import type { Principal } from '../oauth.js';
import type { McpView, SyncDeps } from '../sync.js';
import { capture, CAPTURE_INPUT_SCHEMA, parseCaptureArgs } from './capture.js';
import { find, FIND_INPUT_SCHEMA, parseFindArgs } from './find.js';

/**
 * The remote surface's tool set and the prose that describes it
 * (templates/mcp/, shipped-prose-lives-in-templates). Built per request from
 * the server's current state; every tool reads through `view.read`, so it
 * sees one commit and its result names it.
 */

/** Present while the build stops at the real-client checkpoint (tasks group 5); removed with the capture stub in task 7.3. */
const CHECKPOINT_BUILD = true;

export function serverInstructions(storeName: string): string {
  const base = packagedTemplate('mcp', 'server-instructions').replaceAll('__STORE_NAME__', storeName);
  return CHECKPOINT_BUILD ? `${base}\n\n${packagedTemplate('mcp', 'instructions-checkpoint')}` : base;
}

export interface ToolContext {
  view: McpView;
  deps: SyncDeps;
  /** `serve.base_url` from the loaded configuration. */
  baseUrl: string | undefined;
}

export function buildTools(ctx: ToolContext): ToolDefinition<Principal>[] {
  const captureDescription = packagedTemplate('mcp', 'capture');
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
        return ctx.view.read(ctx.deps, (snapshot) => find(snapshot, parsed, ctx.baseUrl));
      },
    },
    {
      name: 'capture',
      title: 'Capture into the store',
      description: CHECKPOINT_BUILD ? `${captureDescription}\n\n${packagedTemplate('mcp', 'capture-checkpoint')}` : captureDescription,
      inputSchema: CAPTURE_INPUT_SCHEMA,
      scope: 'capture',
      readOnly: false,
      run: (args) => {
        const parsed = parseCaptureArgs(args);
        return ctx.view.read(ctx.deps, (snapshot) => capture(snapshot.store, parsed));
      },
    },
  ];
}
