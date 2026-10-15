import path from 'node:path';
import { packagedTemplate } from '../../templates.js';
import type { Store } from '../../store.js';
import type { ToolDefinition } from '../jsonrpc.js';
import type { Principal } from '../oauth.js';
import type { StoreSync } from '../sync.js';
import { capture, CAPTURE_INPUT_SCHEMA, parseCaptureArgs } from './capture.js';
import { find, FIND_INPUT_SCHEMA, parseFindArgs } from './find.js';

/**
 * The remote surface's tool set and the prose that describes it
 * (templates/mcp/, shipped-prose-lives-in-templates). Every tool reads
 * through `sync.read`, so it sees one commit and its result names it.
 */

function storeName(store: Store): string {
  return path.basename(store.root);
}

function withStoreName(text: string, store: Store): string {
  return text.replaceAll('__STORE_NAME__', storeName(store));
}

/** Present while the build stops at the real-client checkpoint (tasks group 4); removed with the capture stub in task 6.1. */
const CHECKPOINT_BUILD = true;

export function serverInstructions(store: Store): string {
  const base = withStoreName(packagedTemplate('mcp', 'server-instructions'), store);
  return CHECKPOINT_BUILD ? `${base}\n\n${packagedTemplate('mcp', 'instructions-checkpoint')}` : base;
}

export function buildTools(store: Store, sync: StoreSync): ToolDefinition<Principal>[] {
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
        return sync.read((snapshot) => find(store, snapshot, parsed));
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
        return sync.read(() => capture(store, parsed));
      },
    },
  ];
}
