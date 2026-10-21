import { stat } from 'node:fs/promises';
import path from 'node:path';
import { CONFIG_FILE_NAME } from '../root.js';
import type { StoreConfig } from '../../config/schema.js';
import type { Store } from '../store.js';
import type { ApprovalServer } from './approve.js';

/**
 * serve-follows-config-changes: what `ctxr serve` answers a request with — the
 * store as its configuration last loaded, and the approval surface built from
 * it. A request takes one state at its start, so it never mixes two
 * configurations (design.md D2).
 */
export interface ServingState {
  store: Store;
  approval: ApprovalServer | null;
  /** Set when change_approval is declared and the surface could not be built after startup (design.md D4). */
  approvalError: string | null;
}

export interface ServingStateHolder {
  current(): Promise<ServingState>;
}

export interface FileIdentity {
  mtimeMs: number;
  size: number;
  dev: number;
  ino: number;
}

export interface ServingStateOptions {
  initial: Store;
  initialApproval: ApprovalServer | null;
  load(root: string): Promise<StoreConfig>;
  /** Builds the approval surface for a store, or null when it declares none; throws when it cannot be built. */
  buildApproval(store: Store): Promise<ApprovalServer | null>;
  log(line: string): void;
  now?: () => number;
  identify?: (file: string) => Promise<FileIdentity>;
  retryMs?: number;
}

const DEFAULT_RETRY_MS = 30_000;

async function identifyFile(file: string): Promise<FileIdentity> {
  const s = await stat(file);
  return { mtimeMs: s.mtimeMs, size: s.size, dev: s.dev, ino: s.ino };
}

function identityKey(id: FileIdentity): string {
  return `${id.mtimeMs}:${id.size}:${id.dev}:${id.ino}`;
}

/** design.md D3: the approval surface is rebuilt only when what it is built from changes. */
function approvalInputs(config: StoreConfig): string {
  return JSON.stringify({ change_approval: config.change_approval ?? null, base_url: config.serve?.base_url ?? null });
}

function messageOf(err: unknown): string {
  if (typeof err === 'object' && err !== null && 'finding' in err) {
    const finding = (err as { finding?: { message?: unknown } }).finding;
    if (typeof finding?.message === 'string') return finding.message;
  }
  return err instanceof Error ? err.message : String(err);
}

/**
 * context-browsing spec ("The server follows changes to the store's
 * configuration"), design.md D1: one `stat` per request, compared on
 * modification time, size and file identity, because the file is replaced by
 * a rename (a watcher on the old inode goes silent). A changed file is read and
 * validated again; one that does not load leaves the last good configuration in
 * place and is reported once (D5).
 */
export async function createServingState(opts: ServingStateOptions): Promise<ServingStateHolder> {
  const root = opts.initial.root;
  const file = path.join(root, CONFIG_FILE_NAME);
  const identify = opts.identify ?? identifyFile;
  const now = opts.now ?? (() => Date.now());
  const retryMs = opts.retryMs ?? DEFAULT_RETRY_MS;

  let state: ServingState = { store: opts.initial, approval: opts.initialApproval, approvalError: null };
  let builtFrom = approvalInputs(opts.initial.config);
  let seen = identityKey(await identify(file));
  let lastLoadFailure: string | null = null;
  let lastApprovalAttempt = 0;
  let busy: Promise<void> | null = null;

  async function rebuildApproval(store: Store): Promise<Pick<ServingState, 'approval' | 'approvalError'>> {
    lastApprovalAttempt = now();
    try {
      return { approval: await opts.buildApproval(store), approvalError: null };
    } catch (err) {
      const message = messageOf(err);
      opts.log(`serve: the approval page is unavailable: ${message}`);
      return { approval: null, approvalError: message };
    }
  }

  async function refresh(): Promise<void> {
    let key: string;
    try {
      key = identityKey(await identify(file));
    } catch (err) {
      const reason = `${CONFIG_FILE_NAME} cannot be read (${messageOf(err)})`;
      if (lastLoadFailure !== reason) opts.log(`serve: ${reason}; still serving the configuration loaded before.`);
      lastLoadFailure = reason;
      return;
    }

    if (key !== seen) {
      seen = key;
      let config: StoreConfig;
      try {
        config = await opts.load(root);
      } catch (err) {
        const reason = messageOf(err);
        if (lastLoadFailure !== reason) opts.log(`serve: ${file} does not load (${reason}); still serving the configuration loaded before.`);
        lastLoadFailure = reason;
        return;
      }
      lastLoadFailure = null;
      const store: Store = { root, config };
      const inputs = approvalInputs(config);
      if (inputs !== builtFrom) {
        builtFrom = inputs;
        state = { store, ...(await rebuildApproval(store)) };
      } else {
        state = { ...state, store };
      }
      return;
    }

    // design.md D4: an approval surface that failed after startup is retried on request, at most every retryMs.
    if (state.approvalError !== null && now() - lastApprovalAttempt >= retryMs) {
      state = { ...state, ...(await rebuildApproval(state.store)) };
    }
  }

  return {
    async current() {
      // Serialized: concurrent requests share one stat-and-reload, and each then takes the same state.
      busy ??= refresh().finally(() => {
        busy = null;
      });
      await busy;
      return state;
    },
  };
}
