import { ExitCode } from './exit-codes.js';
import type { Finding } from './envelope.js';

/**
 * Base for every error contexture raises deliberately (as opposed to a bug,
 * which throws something else and is mapped to ExitCode.Internal). Each
 * carries the finding that explains, in the fail-loud contract's terms,
 * exactly what could not be determined — never a guessed fallback.
 */
export class ContextureError extends Error {
  readonly exitCode: ExitCode;
  readonly finding: Finding;

  constructor(exitCode: ExitCode, finding: Finding) {
    super(finding.message);
    this.name = new.target.name;
    this.exitCode = exitCode;
    this.finding = finding;
  }
}

export class NoStoreRootError extends ContextureError {
  constructor(checked: { flag: boolean; env: boolean; cwd: string }) {
    super(ExitCode.Usage, {
      code: 'root.not_found',
      severity: 'error',
      message:
        'No store root found: checked --root, CONTEXTURE_ROOT, and walking up ' +
        `from "${checked.cwd}" looking for contexture.yaml.`,
      details: { checkedFlag: checked.flag, checkedEnv: checked.env, cwd: checked.cwd },
    });
  }
}

export class NotAGitRepositoryError extends ContextureError {
  constructor(root: string) {
    super(ExitCode.Usage, {
      code: 'root.not_a_git_repository',
      severity: 'error',
      message: `"${root}" is not inside a git repository.`,
      subject: root,
    });
  }
}

export class SchemaVersionNewerError extends ContextureError {
  constructor(storeVersion: number, supportedVersion: number) {
    super(ExitCode.Usage, {
      code: 'config.schema_version.newer',
      severity: 'error',
      message:
        `This store's schema_version (${storeVersion}) is newer than the ` +
        `version this contexture release supports (${supportedVersion}).`,
      details: { storeVersion, supportedVersion },
    });
  }
}

export class SchemaVersionMissingError extends ContextureError {
  constructor(configPath: string) {
    super(ExitCode.Usage, {
      code: 'config.schema_version.missing',
      severity: 'error',
      message:
        `"${configPath}" has no schema_version field — this store predates ` +
        'the schema-version requirement and must be migrated with an explicit tool.',
      subject: configPath,
    });
  }
}

export class InvalidConfigError extends ContextureError {
  constructor(configPath: string, issues: readonly { path: string; message: string }[]) {
    super(ExitCode.Usage, {
      code: 'config.invalid',
      severity: 'error',
      message: `"${configPath}" failed validation: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`,
      subject: configPath,
      details: { issues },
    });
  }
}

export class MarkerMismatchError extends ContextureError {
  constructor(filePath: string, detail: string) {
    super(ExitCode.Usage, {
      code: 'fenced_region.marker_mismatch',
      severity: 'error',
      message: `"${filePath}" has a mismatched marker pair: ${detail}. No bytes were written.`,
      subject: filePath,
    });
  }
}

export class GitIdentityMissingError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'git.identity_missing',
      severity: 'error',
      message:
        'git has no configured author identity. Run:\n' +
        '  git config user.email "you@example.com"\n' +
        '  git config user.name "Your Name"\n' +
        'then re-run init.',
    });
  }
}

export class TaxonomySelectionConflictError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'taxonomy.selection_conflict',
      severity: 'error',
      message: '--profile and --taxonomy were both given; pass exactly one.',
    });
  }
}

export class InvalidTaxonomyFileError extends ContextureError {
  constructor(filePath: string, issues: readonly { path: string; message: string }[]) {
    super(ExitCode.Usage, {
      code: 'taxonomy.invalid_file',
      severity: 'error',
      message: `"${filePath}" is not a valid taxonomy definition: ${issues
        .map((i) => `${i.path}: ${i.message}`)
        .join('; ')}`,
      subject: filePath,
      details: { issues },
    });
  }
}

export class UnknownTaxonomyProfileError extends ContextureError {
  constructor(given: string, knownIds: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'taxonomy.unknown_profile',
      severity: 'error',
      message: `Unknown taxonomy profile "${given}". Known profiles: ${knownIds.join(', ')}.`,
      subject: given,
      details: { knownIds },
    });
  }
}
