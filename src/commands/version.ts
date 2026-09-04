import type { CommandOutcome, CommandRequires } from '../core/command.js';
import type { RunEnv } from '../core/env.js';
import type { Finding } from '../core/envelope.js';
import { ExitCode } from '../core/exit-codes.js';
import type { InstallKind } from '../core/install-kind.js';
import { resolveInstallLocation } from '../core/install-kind.js';
import { ownPackageName } from '../core/registry.js';
import { compareRelease } from '../core/version-check.js';
import { CLI_VERSION } from '../version.js';

/**
 * cli-contract: the CLI reports its own version and how it was installed.
 * `store: 'absent'` — the version of the running executable is a fact about
 * the installation, not about any store, so this must answer from a directory
 * that resolves to no store root at all.
 */
export const requires: CommandRequires = { store: 'absent' };

export type ReleaseStatus = 'current' | 'newer-available' | 'undetermined';

export interface VersionData {
  version: string;
  install_path: string;
  install_kind: InstallKind;
  /** Only present with --check. Null when the published version could not be resolved. */
  latest?: string | null;
  release_status?: ReleaseStatus;
}

export interface VersionFlags {
  check?: boolean;
}

/**
 * Unlike the session-start/update advisory, this check IS the command's whole
 * purpose, so it fails loud: an answer that could not be determined exits with
 * the usage code naming what was missing, rather than degrading to "current".
 * It also reads the registry directly, never the cache — an operator who asks
 * explicitly is asking about now.
 */
export async function execute(env: RunEnv, flags: VersionFlags = {}): Promise<CommandOutcome<VersionData>> {
  const install = resolveInstallLocation(env.execPath);
  const base: VersionData = {
    version: CLI_VERSION,
    install_path: install.path,
    install_kind: install.kind,
  };

  if (!flags.check) {
    return {
      exitCode: ExitCode.Ok,
      data: base,
      findings: [],
      humanSummary: CLI_VERSION,
      storeRoot: null,
      schemaVersion: null,
    };
  }

  const lookup = await env.registry.latestVersion(ownPackageName());
  if (lookup.kind === 'undetermined') {
    return undetermined(base, `the latest published version could not be determined: ${lookup.reason}`);
  }

  const comparison = compareRelease(CLI_VERSION, lookup.version);
  if (comparison.kind === 'undetermined') {
    return undetermined({ ...base, latest: lookup.version }, comparison.reason);
  }

  if (comparison.kind === 'newer-available') {
    const finding: Finding = {
      code: 'cli.update_available',
      severity: 'info',
      message: `ctxr ${comparison.installed} is installed; ${comparison.latest} is available.`,
      subject: ownPackageName(),
      details: { installed: comparison.installed, latest: comparison.latest },
    };
    return {
      exitCode: ExitCode.CheckFailed,
      data: { ...base, latest: lookup.version, release_status: 'newer-available' },
      findings: [finding],
      humanSummary: `ctxr ${comparison.installed} is installed; ${comparison.latest} is available.`,
      storeRoot: null,
      schemaVersion: null,
    };
  }

  return {
    exitCode: ExitCode.Ok,
    data: { ...base, latest: lookup.version, release_status: 'current' },
    findings: [],
    humanSummary: `ctxr ${CLI_VERSION} is the latest published version.`,
    storeRoot: null,
    schemaVersion: null,
  };
}

function undetermined(data: VersionData, reason: string): CommandOutcome<VersionData> {
  const finding: Finding = {
    code: 'cli.update_check_failed',
    severity: 'info',
    message: reason,
    subject: ownPackageName(),
  };
  return {
    exitCode: ExitCode.Usage,
    data: { ...data, latest: data.latest ?? null, release_status: 'undetermined' },
    findings: [finding],
    humanSummary: `error: ${reason}`,
    storeRoot: null,
    schemaVersion: null,
  };
}
