import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { handleMcpRequest, MCP_PATH, type Authentication } from '../../src/core/mcp/http.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { RELATION_DIRECTEDNESS_NOTE, RELATION_VOCABULARY } from '../../src/config/defaults.js';
import { readConfig } from '../../src/config/load.js';
import type { StoreConfig } from '../../src/config/schema.js';
import { buildTools, serverInstructions, type ToolContext } from '../../src/core/mcp/tools/index.js';
import { placeholderName, STORE_PLACEHOLDERS } from '../../src/core/skill-placeholders.js';
import { renderMcpSkills } from '../../src/core/skills.js';
import { CLI_VERSION } from '../../src/version.js';
import { hermeticGitEnv } from '../helpers/git-env.js';
import { runCli } from '../helpers/run-cli.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

const execFileAsync = promisify(execFile);
import {
  dispatch,
  JSONRPC_INVALID_PARAMS,
  JSONRPC_INVALID_REQUEST,
  JSONRPC_METHOD_NOT_FOUND,
  JSONRPC_PARSE_ERROR,
  negotiateProtocolVersion,
  SUPPORTED_PROTOCOL_VERSIONS,
  ToolRefusal,
  type DispatchContext,
  type JsonRpcResponse,
  type ToolDefinition,
} from '../../src/core/mcp/jsonrpc.js';

interface Principal {
  scopes: string[];
}

const echo: ToolDefinition<Principal> = {
  name: 'echo',
  title: 'Echo',
  description: 'returns its arguments',
  inputSchema: { type: 'object' },
  scope: 'read',
  annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  run: async (args) => ({ echoed: args }),
};

const refuses: ToolDefinition<Principal> = {
  ...echo,
  name: 'refuses',
  run: async () => {
    throw new ToolRefusal('test.refused', 'no, thank you');
  },
};

function context(principal: Principal = { scopes: ['read'] }): DispatchContext<Principal> {
  return {
    principal,
    tools: () => [echo, refuses].filter((t) => principal.scopes.includes(t.scope)),
    instructions: 'read the store',
    authorizeCall: () => undefined,
    refusalFor: () => undefined,
  };
}

describe('mcp jsonrpc dispatch', () => {
  it('initialize echoes a supported protocol version and falls back to the newest otherwise', async () => {
    const answer = (await dispatch({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } }, context())) as JsonRpcResponse;
    expect(answer.result).toMatchObject({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'contexture' }, instructions: 'read the store' });
    expect(negotiateProtocolVersion('1999-01-01')).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
    expect(negotiateProtocolVersion(undefined)).toBe(SUPPORTED_PROTOCOL_VERSIONS[0]);
  });

  it('tools/list lists only what the context exposes, with annotations', async () => {
    const answer = (await dispatch({ jsonrpc: '2.0', id: 'a', method: 'tools/list' }, context())) as JsonRpcResponse;
    const tools = (answer.result as { tools: { name: string; annotations: { readOnlyHint: boolean } }[] }).tools;
    expect(tools.map((t) => t.name)).toEqual(['echo', 'refuses']);
    expect(tools[0]!.annotations.readOnlyHint).toBe(true);
    const none = (await dispatch({ jsonrpc: '2.0', id: 'b', method: 'tools/list' }, context({ scopes: [] }))) as JsonRpcResponse;
    expect((none.result as { tools: unknown[] }).tools).toEqual([]);
  });

  // serve-the-session-lifecycle-to-chat-apps D8, task 5.2: every shipped tool carries a title and all four hints.
  it('lists every shipped tool with a title and honest annotations', async () => {
    const shipped = buildTools({ view: {}, syncDeps: {}, write: {}, mutex: {}, baseUrl: undefined } as unknown as ToolContext);
    const answer = (await dispatch(
      { jsonrpc: '2.0', id: 'c', method: 'tools/list' },
      { principal: { email: 'a@example.com', scopes: ['read', 'capture', 'edit'] }, tools: () => shipped, instructions: '', authorizeCall: () => undefined, refusalFor: () => undefined },
    )) as JsonRpcResponse;
    type Listed = { name: string; title: string; annotations: Record<string, unknown> };
    const tools = (answer.result as { tools: Listed[] }).tools;
    expect(tools.length).toBe(shipped.length);
    for (const tool of tools) {
      expect(tool.title, tool.name).toMatch(/\S/);
      expect(tool.annotations, tool.name).toEqual({
        title: tool.title,
        readOnlyHint: expect.any(Boolean),
        destructiveHint: expect.any(Boolean),
        idempotentHint: expect.any(Boolean),
        openWorldHint: false,
      });
    }
    const hints = Object.fromEntries(tools.map((t) => [t.name, t.annotations]));
    for (const name of ['find', 'gather', 'Read', 'Grep', 'Glob', 'ctxr', 'session_list', 'session_status']) expect(hints[name], name).toMatchObject({ readOnlyHint: true, destructiveHint: false, idempotentHint: true });
    for (const name of ['capture', 'session_start', 'Edit', 'Write', 'Move', 'ctxr_write', 'session_rebase', 'session_submit']) expect(hints[name], name).toMatchObject({ readOnlyHint: false, destructiveHint: false });
    for (const name of ['Delete', 'session_discard']) expect(hints[name], name).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('tools/call returns structured content, and a refusal as an isError result', async () => {
    const ok = (await dispatch({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'echo', arguments: { x: 1 } } }, context())) as JsonRpcResponse;
    expect(ok.result).toMatchObject({ isError: false, structuredContent: { echoed: { x: 1 } } });
    const refused = (await dispatch({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'refuses' } }, context())) as JsonRpcResponse;
    expect(refused.error).toBeUndefined();
    expect(refused.result).toMatchObject({ isError: true, structuredContent: { error: { code: 'test.refused' } } });
  });

  it('an unknown tool or malformed params is an invalid-params error', async () => {
    const unknown = (await dispatch({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'nope' } }, context())) as JsonRpcResponse;
    expect(unknown.error?.code).toBe(JSONRPC_INVALID_PARAMS);
    const badArgs = (await dispatch({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'echo', arguments: [1] } }, context())) as JsonRpcResponse;
    expect(badArgs.error?.code).toBe(JSONRPC_INVALID_PARAMS);
  });

  it('an unknown method is method-not-found, a notification gets no answer, a non-request is invalid', async () => {
    const unknown = (await dispatch({ jsonrpc: '2.0', id: 6, method: 'resources/list' }, context())) as JsonRpcResponse;
    expect(unknown.error?.code).toBe(JSONRPC_METHOD_NOT_FOUND);
    expect(await dispatch({ jsonrpc: '2.0', method: 'notifications/initialized' }, context())).toBeNull();
    const invalid = (await dispatch({ hello: 'world' }, context())) as JsonRpcResponse;
    expect(invalid.error?.code).toBe(JSONRPC_INVALID_REQUEST);
  });

  it('a batch is answered as a batch, omitting notifications', async () => {
    const answers = (await dispatch(
      [
        { jsonrpc: '2.0', id: 1, method: 'ping' },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
      ],
      context(),
    )) as JsonRpcResponse[];
    expect(answers).toEqual([{ jsonrpc: '2.0', id: 1, result: {} }]);
  });
});

describe('mcp streamable http transport', () => {
  let server: Server | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  async function start(admit: boolean): Promise<string> {
    server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      void handleMcpRequest<Principal>(
        {
          originAllowed: (origin) => origin === 'https://allowed.example',
          authenticate: async (): Promise<Authentication<Principal>> =>
            admit
              ? { kind: 'admitted', principal: { scopes: ['read'] } }
              : { kind: 'refused', status: 401, headers: { 'WWW-Authenticate': 'Bearer' }, body: { error: 'invalid_token' } },
          contextFor: (principal) => context(principal),
        },
        req,
        res,
        url.pathname,
      ).then((handled) => {
        if (!handled) {
          res.writeHead(404);
          res.end();
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server!.address() as AddressInfo).port}${MCP_PATH}`;
  }

  const post = (url: string, body: string, headers: Record<string, string> = {}) =>
    fetch(url, { method: 'POST', body, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers } });

  it('answers a request with JSON and a notification with 202', async () => {
    const url = await start(true);
    const res = await post(url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ jsonrpc: '2.0', id: 1, result: {} });
    const note = await post(url, JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }));
    expect(note.status).toBe(202);
  });

  it('refuses GET and DELETE with 405, a foreign origin with 403, malformed JSON with a parse error', async () => {
    const url = await start(true);
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: 'DELETE' })).status).toBe(405);
    expect((await post(url, '{}', { Origin: 'https://evil.example' })).status).toBe(403);
    expect((await post(url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }), { Origin: 'https://allowed.example' })).status).toBe(200);
    const bad = await post(url, '{nope');
    expect(bad.status).toBe(400);
    expect(((await bad.json()) as JsonRpcResponse).error?.code).toBe(JSONRPC_PARSE_ERROR);
  });

  it('passes a refused authentication straight through, before reading the body', async () => {
    const url = await start(false);
    const res = await post(url, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Bearer');
  });

  it('refuses an oversized body with 413', async () => {
    const url = await start(true);
    const res = await post(url, 'x'.repeat(1024 * 1024 + 1));
    expect(res.status).toBe(413);
  });
});

/**
 * publish-one-contexture-plugin D2 (remote-access spec, *The server
 * instructions give this store's values*): the store section the general
 * plugin's skills read their placeholders from.
 */
describe('the server instructions', () => {
  // A store `ctxr init` wrote, so the configuration is the one a real store loads.
  let loaded: StoreConfig;
  let tmp: TmpDir;
  beforeAll(async () => {
    tmp = await makeTmpDir('contexture-instructions-');
    const env = hermeticGitEnv();
    await execFileAsync('git', ['init', '-q', '-b', 'main'], { cwd: tmp.root, env: env as NodeJS.ProcessEnv });
    const init = await runCli(['init'], { cwd: tmp.root, env, timeoutMs: 60_000 });
    if (init.exitCode !== 0) throw new Error(`ctxr init failed: ${init.stderr}`);
    loaded = await readConfig(tmp.root);
  }, 120_000);
  afterAll(async () => {
    await tmp?.cleanup();
  });

  it("give this store's value for every placeholder the skills name, its layers with descriptions, the relation vocabulary and the CLI version", () => {
    const config = { ...loaded, ingest: { ...loaded.ingest, inbox_path: 'raw/inbox/' }, organize: { ...loaded.organize, log_path: 'records/log.md' } };
    const text = serverInstructions('pkm', config);
    const section = text.slice(text.indexOf('## This store'));
    expect(section).not.toBe(text);
    expect(text).not.toMatch(/__[A-Z][A-Z0-9_]*__/);

    expect(section).toContain("These are pkm's values, by the same names:");
    expect(section).toContain('- `<inbox path>`: `raw/inbox/`');
    expect(section).toContain('- `<log path>`: `records/log.md`');
    for (const placeholder of STORE_PLACEHOLDERS) expect(section, placeholder.token).toContain(`- \`${placeholderName(placeholder)}\`: \`${placeholder.value(config)}\``);
    // Every placeholder the general plugin's skills carry is answered here, by the one label both read.
    const skills = renderMcpSkills().map((skill) => skill.content).join('\n');
    const named = new Set([...skills.matchAll(/<([a-z][a-z ]+)>/g)].map((m) => m[1]!).filter((label) => STORE_PLACEHOLDERS.some((p) => p.label === label)));
    expect(named.size).toBeGreaterThanOrEqual(10);
    for (const label of named) expect(section, label).toContain(`- \`<${label}>\`: `);

    expect(config.taxonomy.layers.length).toBeGreaterThan(0);
    for (const layer of config.taxonomy.layers) expect(section).toContain(`- **${layer.name}** (\`${layer.path.replace(/\/*$/, '/')}\`): ${layer.description}`);
    for (const relation of RELATION_VOCABULARY) expect(section).toContain(`- **${relation.name}**: ${relation.definition}`);
    expect(section).toContain(RELATION_DIRECTEDNESS_NOTE);
    expect(section).toContain(`This server runs ctxr ${CLI_VERSION}.`);
  });

  it('says so when the store declares no layers', async () => {
    const text = serverInstructions('pkm', { ...loaded, taxonomy: { profile: 'custom', layers: [] } });
    expect(text).toMatch(/what belongs there:\n\n- none\n/);
  });
});
