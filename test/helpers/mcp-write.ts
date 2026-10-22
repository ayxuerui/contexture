import { readConfig } from '../../src/config/load.js';
import { MIGRATION_STEPS } from '../../src/config/migrations.js';
import { ghCredentials } from '../../src/core/forge/credentials.js';
import { createGhForgeClient } from '../../src/core/forge/github.js';
import { createExecFileGitRunner } from '../../src/core/git/exec.js';
import { Mutex, type WriteDeps } from '../../src/core/mcp/sessions.js';
import { McpView, type SyncDeps } from '../../src/core/mcp/sync.js';
import { buildTools, type ToolContext } from '../../src/core/mcp/tools/index.js';
import { makeApprovalStore, RECORDING_LOGIN, type ApprovalStore, type ApprovalStoreOptions } from './approval-store.js';

/**
 * The write side of the MCP surface against a real canonical checkout, a bare
 * origin and the fake `gh`: everything `serve` would hand the tools, built
 * without the HTTP layer so a test can call a tool and inspect git and the
 * forge directly.
 */
export interface McpWriteFixture {
  store: ApprovalStore;
  view: McpView;
  syncDeps: SyncDeps;
  write: WriteDeps;
  ctx: ToolContext;
  tick(seconds: number): void;
  /** Re-reads the canonical configuration, after a test commits a change to it. */
  reload(): Promise<void>;
  /** Calls a tool as `email`, returning its result or throwing its refusal. */
  call(name: string, args: Record<string, unknown>, email?: string): Promise<Record<string, unknown>>;
}

export const MEMBER = 'a@example.com';

export async function makeMcpWriteFixture(opts: ApprovalStoreOptions = {}): Promise<McpWriteFixture> {
  const store = await makeApprovalStore(opts);
  const git = createExecFileGitRunner();
  let clock = new Date('2026-01-01T00:00:00Z');
  const now = () => clock;
  const credentials = ghCredentials(store.env);
  const forge = createGhForgeClient(store.root, credentials);
  const view = new McpView({ git, canonicalRoot: store.root, now });
  const fixture = {} as McpWriteFixture;

  const build = async (): Promise<void> => {
    const config = await readConfig(store.root, MIGRATION_STEPS);
    const syncDeps: SyncDeps = { config, credentials, forge, env: store.env };
    const write: WriteDeps = { ...syncDeps, git, canonicalRoot: store.root, now, recordingLogin: RECORDING_LOGIN, baseUrl: 'https://ctx-a.example.test' };
    fixture.syncDeps = syncDeps;
    fixture.write = write;
    fixture.ctx = { view, syncDeps, write, mutex, baseUrl: 'https://ctx-a.example.test' };
  };
  const mutex = new Mutex();
  await build();

  Object.assign(fixture, {
    store,
    view,
    tick(seconds: number) {
      clock = new Date(clock.getTime() + seconds * 1000);
    },
    reload: build,
    async call(name: string, args: Record<string, unknown>, email = MEMBER) {
      const tool = buildTools(fixture.ctx).find((t) => t.name === name);
      if (tool === undefined) throw new Error(`no tool ${name}`);
      return (await tool.run(args, { email, scopes: ['read', 'capture', 'edit'] })) as Record<string, unknown>;
    },
  });
  return fixture;
}
