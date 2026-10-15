import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as member from '../../src/commands/mcp-member.js';
import { ContextureError } from '../../src/core/errors.js';
import {
  generateAccessCode,
  hashAccessCode,
  loadSigningKey,
  MEMBERS_FILE,
  MemberRegistry,
  normalizeAccessCode,
  resolveStateDir,
} from '../../src/core/mcp/state.js';
import type { Store } from '../../src/core/store.js';
import { makeFakeEnv } from '../helpers/fake-env.js';
import { makeTmpDir, type TmpDir } from '../helpers/tmp-store.js';

describe('mcp membership', () => {
  let tmp: TmpDir;
  let store: Store;
  let stateDir: string;
  const env = () => makeFakeEnv({ cwd: tmp.root });

  beforeEach(async () => {
    tmp = await makeTmpDir('contexture-mcp-member-');
    const root = path.join(tmp.root, 'store');
    await mkdir(root);
    store = { root, config: { schema_version: 1 } } as unknown as Store;
    stateDir = path.join(tmp.root, 'state');
  });

  afterEach(async () => {
    await tmp.cleanup();
  });

  it('add returns an access code once; list never shows a code or its hash', async () => {
    const added = await member.add(env(), store, { name: 'ctx-a', scope: 'read', stateDir });
    expect(added.data?.code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){4}$/);
    expect(added.humanSummary).toContain(added.data!.code);

    const listed = await member.list(env(), store, { stateDir });
    expect(listed.data?.members).toEqual([{ name: 'ctx-a', email: null, scopes: ['read'], created: '2026-01-01T00:00:00.000Z' }]);
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain(added.data!.code);
    expect(serialized).not.toContain(hashAccessCode(added.data!.code));

    const raw = await readFile(path.join(stateDir, MEMBERS_FILE), 'utf8');
    expect(raw).not.toContain(added.data!.code);
    expect(raw).toContain(hashAccessCode(added.data!.code));
    expect((await stat(path.join(stateDir, MEMBERS_FILE))).mode & 0o777).toBe(0o600);
  });

  it('refuses a duplicate name, an unknown scope, and removing a stranger', async () => {
    await member.add(env(), store, { name: 'ctx-a', scope: 'read,capture', stateDir });
    await expect(member.add(env(), store, { name: 'CTX-A', scope: 'read', stateDir })).rejects.toMatchObject({ finding: { code: 'mcp.member_exists' } });
    await expect(member.add(env(), store, { name: 'ctx-b', scope: 'admin', stateDir })).rejects.toMatchObject({ finding: { code: 'mcp.scope_unknown' } });
    await expect(member.remove(env(), store, { name: 'ctx-z', stateDir })).rejects.toMatchObject({ finding: { code: 'mcp.member_not_found' } });
  });

  it('remove drops the member; re-adding the name mints a new id', async () => {
    const first = await member.add(env(), store, { name: 'ctx-a', scope: 'read', stateDir });
    const registry = new MemberRegistry(stateDir);
    const before = await registry.byCode(first.data!.code);
    expect(before?.name).toBe('ctx-a');

    await member.remove(env(), store, { name: 'ctx-a', stateDir });
    expect(await registry.byId(before!.id)).toBeUndefined();
    expect(await registry.byCode(first.data!.code)).toBeUndefined();

    const second = await member.add(env(), store, { name: 'ctx-a', scope: 'read', stateDir });
    const after = await registry.byCode(second.data!.code);
    expect(after?.id).not.toBe(before!.id);
  });

  it('refuses a state directory inside the store root, and writes nothing there', async () => {
    const inside = path.join(store.root, '.contexture', 'mcp');
    let error: unknown;
    try {
      await member.add(env(), store, { name: 'ctx-a', scope: 'read', stateDir: inside });
    } catch (err) {
      error = err;
    }
    expect(error).toBeInstanceOf(ContextureError);
    expect((error as ContextureError).finding.code).toBe('mcp.state_dir_inside_store');
    await expect(stat(inside)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(() => resolveStateDir(store.root, undefined, store.root, tmp.root)).toThrow(ContextureError);
  });

  it('defaults the state directory under HOME, keyed by the store root', () => {
    const dir = resolveStateDir(store.root, '/home/ctx-a', undefined, tmp.root);
    expect(dir).toMatch(/^\/home\/ctx-a\/\.contexture\/mcp\/[0-9a-f]{12}$/);
  });

  it('normalizes a retyped code: case, hyphens, spaces and look-alikes', () => {
    const code = generateAccessCode();
    const retyped = ` ${code.toLowerCase().replace(/-/g, ' ')} `;
    expect(hashAccessCode(retyped)).toBe(hashAccessCode(code));
    expect(normalizeAccessCode('ilo-0')).toBe('1100');
  });

  it('creates the signing key once and reads the same key back', async () => {
    await mkdir(stateDir, { recursive: true });
    const [a, b] = await Promise.all([loadSigningKey(stateDir), loadSigningKey(stateDir)]);
    expect(a.length).toBe(32);
    expect(Buffer.compare(a, await loadSigningKey(stateDir))).toBe(0);
    expect(Buffer.compare(b, a)).toBe(0);
  });
});
