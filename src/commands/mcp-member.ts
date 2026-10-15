import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import { ContextureError } from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import {
  ensureStateDir,
  generateAccessCode,
  hashAccessCode,
  loadSigningKey,
  newMemberId,
  parseScopes,
  readMembers,
  resolveStateDir,
  writeMembers,
  type McpScope,
} from '../core/mcp/state.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

/**
 * remote-access spec, *Membership is managed on the host and its secrets
 * never enter the store*: the operator's side of admission. `add` is the one
 * place an access code is ever shown; the members file keeps only its hash.
 */

export interface MemberCommonFlags {
  stateDir?: string;
}

export interface MemberAddFlags extends MemberCommonFlags {
  name: string;
  scope: string;
  email?: string;
}

export interface MemberAddData {
  name: string;
  email: string | null;
  scopes: McpScope[];
  code: string;
  state_dir: string;
}

export interface MemberRemoveData {
  name: string;
  state_dir: string;
}

export interface MemberListData {
  members: { name: string; email: string | null; scopes: McpScope[]; created: string }[];
  state_dir: string;
}

const NAME_RE = /^[^\s\p{Cc}][^\p{Cc}]{0,63}$/u;

function memberError(exitCode: ExitCode, code: string, message: string, subject?: string): ContextureError {
  return new ContextureError(exitCode, { code, severity: 'error', message, ...(subject ? { subject } : {}) });
}

function stateDirFor(env: RunEnv, store: Store, flags: MemberCommonFlags): string {
  return resolveStateDir(store.root, env.env.HOME, flags.stateDir, env.cwd);
}

const sameName = (a: string, b: string): boolean => a.toLocaleLowerCase() === b.toLocaleLowerCase();

export async function add(env: RunEnv, store: Store, flags: MemberAddFlags): Promise<CommandOutcome<MemberAddData>> {
  const name = flags.name.trim();
  if (!NAME_RE.test(name)) {
    throw memberError(ExitCode.Usage, 'mcp.member_name_invalid', 'A member name is 1–64 printable characters and does not start with a space.', flags.name);
  }
  const scopes = parseScopes(flags.scope);
  const dir = stateDirFor(env, store, flags);
  await ensureStateDir(dir);
  await loadSigningKey(dir);

  const file = await readMembers(dir);
  if (file.members.some((m) => sameName(m.name, name))) {
    throw memberError(ExitCode.Usage, 'mcp.member_exists', `A member named "${name}" already exists; remove it first to issue a new code.`, name);
  }

  const code = generateAccessCode();
  const email = flags.email?.trim() || undefined;
  file.members.push({
    id: newMemberId(),
    name,
    ...(email ? { email } : {}),
    scopes,
    code_sha256: hashAccessCode(code),
    created: env.now().toISOString(),
  });
  file.members.sort((a, b) => a.name.localeCompare(b.name));
  await writeMembers(dir, file);

  return {
    exitCode: ExitCode.Ok,
    data: { name, email: email ?? null, scopes, code, state_dir: dir },
    findings: [],
    humanSummary:
      `Added member "${name}" (${scopes.join(', ')}). Access code, shown only this once: ${code}\n` +
      'Send it to them privately; they enter it once when connecting the store in their chat app.',
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

export async function remove(env: RunEnv, store: Store, flags: MemberCommonFlags & { name: string }): Promise<CommandOutcome<MemberRemoveData>> {
  const dir = stateDirFor(env, store, flags);
  const file = await readMembers(dir);
  const target = file.members.find((m) => sameName(m.name, flags.name.trim()));
  if (target === undefined) {
    throw memberError(ExitCode.Usage, 'mcp.member_not_found', `No member named "${flags.name}".`, flags.name);
  }
  file.members = file.members.filter((m) => m.id !== target.id);
  await writeMembers(dir, file);
  return {
    exitCode: ExitCode.Ok,
    data: { name: target.name, state_dir: dir },
    findings: [],
    humanSummary: `Removed member "${target.name}". Every token issued to them is refused from their next call.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

export async function list(env: RunEnv, store: Store, flags: MemberCommonFlags): Promise<CommandOutcome<MemberListData>> {
  const dir = stateDirFor(env, store, flags);
  const file = await readMembers(dir);
  const members = file.members.map((m) => ({ name: m.name, email: m.email ?? null, scopes: m.scopes, created: m.created }));
  const lines = members.map((m) => `${m.name}${m.email ? ` <${m.email}>` : ''}: ${m.scopes.join(', ')}`);
  return {
    exitCode: ExitCode.Ok,
    data: { members, state_dir: dir },
    findings: [],
    humanSummary: members.length === 0 ? 'No members.' : lines.join('\n'),
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
