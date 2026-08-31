import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { ExitCode } from '../core/exit-codes.js';
import { UnknownIdentityRoleError } from '../core/errors.js';
import {
  addIdentityEntry,
  IDENTITY_ROLES,
  removeIdentityEntry,
  replaceIdentityEntry,
  type IdentityRole,
} from '../core/identity.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface IdentityEditData {
  path: string;
  entries: number;
}

function checkRole(role: string): asserts role is IdentityRole {
  if (!(IDENTITY_ROLES as readonly string[]).includes(role)) {
    throw new UnknownIdentityRoleError(role, IDENTITY_ROLES);
  }
}

function outcome(store: Store, result: { path: string; entries: number }, humanSummary: string): CommandOutcome<IdentityEditData> {
  return {
    exitCode: ExitCode.Ok,
    data: result,
    findings: [],
    humanSummary,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}

export interface IdentityAddFlags {
  file: string;
  text: string;
}

export async function executeAdd(store: Store, flags: IdentityAddFlags): Promise<CommandOutcome<IdentityEditData>> {
  checkRole(flags.file);
  const result = await addIdentityEntry(store.root, store.config, flags.file, flags.text);
  return outcome(store, result, `Added an entry to "${result.path}" (${result.entries} total).`);
}

export interface IdentityReplaceFlags {
  file: string;
  match: string;
  text: string;
}

export async function executeReplace(store: Store, flags: IdentityReplaceFlags): Promise<CommandOutcome<IdentityEditData>> {
  checkRole(flags.file);
  const result = await replaceIdentityEntry(store.root, store.config, flags.file, flags.match, flags.text);
  return outcome(store, result, `Replaced the entry matching "${flags.match}" in "${result.path}" (${result.entries} total).`);
}

export interface IdentityRemoveFlags {
  file: string;
  match: string;
}

export async function executeRemove(store: Store, flags: IdentityRemoveFlags): Promise<CommandOutcome<IdentityEditData>> {
  checkRole(flags.file);
  const result = await removeIdentityEntry(store.root, store.config, flags.file, flags.match);
  return outcome(store, result, `Removed the entry matching "${flags.match}" from "${result.path}" (${result.entries} total).`);
}
