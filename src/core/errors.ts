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

export class InvalidNoteFrontmatterError extends ContextureError {
  constructor(notePath: string, detail: string) {
    super(ExitCode.Usage, {
      code: 'note.invalid_frontmatter',
      severity: 'error',
      message: `"${notePath}" has a frontmatter block that is not valid: ${detail}.`,
      subject: notePath,
    });
  }
}

export class SessionNotFoundError extends ContextureError {
  constructor(branch: string) {
    super(ExitCode.Usage, {
      code: 'session.not_found',
      severity: 'error',
      message: `No session found for branch "${branch}".`,
      subject: branch,
    });
  }
}

export class SessionValidationFailedError extends ContextureError {
  constructor(findings: Finding[]) {
    super(ExitCode.CheckFailed, {
      code: 'session.validation_failed',
      severity: 'error',
      message: `Session validation failed: ${findings.map((f) => f.message).join('; ')}`,
      details: { findings },
    });
  }
}

export class NoRemoteConfiguredError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'session.no_remote',
      severity: 'error',
      message: 'No "origin" remote is configured; add one before submitting a session.',
    });
  }
}

/** session-submit-and-land spec (D1): the gate fails loud, before any forge read, when nothing can consent to a merge. */
export class SessionLandConsentRequiredError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'session.land.consent_required',
      severity: 'error',
      message: 'Non-interactive and no --yes was given; pass --yes to consent to the merge, or run interactively.',
    });
  }
}

export class SessionLandOnDefaultBranchError extends ContextureError {
  constructor(branch: string) {
    super(ExitCode.Usage, {
      code: 'session.land.default_branch',
      severity: 'error',
      message: `"${branch}" is the store's default branch; "ctxr session land" refuses to land it.`,
      subject: branch,
    });
  }
}

export class NoForgeConfiguredError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'session.land.no_forge',
      severity: 'error',
      message: 'No forge adapter is configured or reachable; "ctxr session land" cannot resolve or merge a pull request without one.',
    });
  }
}

export class PullRequestHeadMismatchError extends ContextureError {
  constructor(requested: string, actual: string) {
    super(ExitCode.Usage, {
      code: 'session.land.head_mismatch',
      severity: 'error',
      message: `The resolved pull request's head branch is "${actual}", not the requested "${requested}"; refusing to land the wrong pull request.`,
      details: { requested, actual },
    });
  }
}

export class PullRequestClosedError extends ContextureError {
  constructor(number: number) {
    super(ExitCode.CheckFailed, {
      code: 'session.land.pull_request_closed',
      severity: 'error',
      message: `Pull request #${number} is closed, not merged; "ctxr session land" will not act on it.`,
      subject: String(number),
    });
  }
}

/** session-submit-and-land spec (D1): conflicting AND unknown-after-one-retry share this stop — both need a reader, not a retry. */
export class PullRequestNotMergeableError extends ContextureError {
  constructor(number: number, reason: 'conflicting' | 'unknown') {
    super(ExitCode.CheckFailed, {
      code: 'session.land.pull_request_not_mergeable',
      severity: 'error',
      message:
        reason === 'conflicting'
          ? `Pull request #${number} has conflicts; resolve them per the conflict playbook in ctxr-session-lifecycle, then retry.`
          : `Pull request #${number}'s mergeability is still unknown after a retry; check it on the forge, then retry.`,
      subject: String(number),
      details: { reason },
    });
  }
}

export class MergeNotConfirmedError extends ContextureError {
  constructor(number: number) {
    super(ExitCode.CheckFailed, {
      code: 'session.land.merge_not_confirmed',
      severity: 'error',
      message: `"gh pr merge" completed but pull request #${number} does not read back as merged; verify on the forge before retrying.`,
      subject: String(number),
    });
  }
}

/** session-capture-command spec (D4): zero or several matches both refuse — an ambiguous edit is worse than a missed one. */
export class IdentityEntryMatchError extends ContextureError {
  constructor(filePath: string, match: string, count: number) {
    super(ExitCode.Usage, {
      code: 'identity.entry_match',
      severity: 'error',
      message:
        count === 0
          ? `No entry in "${filePath}" contains "${match}".`
          : `${count} entries in "${filePath}" contain "${match}"; refusing an ambiguous match.`,
      subject: filePath,
      details: { match, count },
    });
  }
}

export class UnknownIdentityRoleError extends ContextureError {
  constructor(given: string, knownRoles: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'identity.unknown_role',
      severity: 'error',
      message: `Unknown identity role "${given}". Known roles: ${knownRoles.join(', ')}.`,
      subject: given,
      details: { knownRoles },
    });
  }
}

/** session-capture-command spec (D2): a proposal file that cannot even be read or parsed fails the whole command — there is nothing to apply item by item. */
export class InvalidCaptureProposalError extends ContextureError {
  constructor(filePath: string, detail: string) {
    super(ExitCode.Usage, {
      code: 'session.capture.invalid_proposal',
      severity: 'error',
      message: `"${filePath}" could not be read as a capture proposal: ${detail}.`,
      subject: filePath,
    });
  }
}

export class CatalogSectionNotFoundError extends ContextureError {
  constructor(sectionId: string) {
    super(ExitCode.Usage, {
      code: 'catalog.section_not_found',
      severity: 'error',
      message: `No catalog section named "${sectionId}".`,
      subject: sectionId,
    });
  }
}

export class GraphIdentityCollisionError extends ContextureError {
  constructor(ids: readonly string[]) {
    super(ExitCode.CheckFailed, {
      code: 'graph.identity_collision',
      severity: 'error',
      message: `Two or more notes resolve to the same graph node identity: ${ids.join(', ')}. No graph artifact was written.`,
      details: { ids },
    });
  }
}

export class NoteNotFoundError extends ContextureError {
  constructor(notePath: string) {
    super(ExitCode.Usage, {
      code: 'note.not_found',
      severity: 'error',
      message: `"${notePath}" does not exist in this store.`,
      subject: notePath,
    });
  }
}

export class AlreadyIngestedError extends ContextureError {
  constructor(notePath: string) {
    super(ExitCode.Usage, {
      code: 'ingest.already_ingested',
      severity: 'error',
      message: `"${notePath}" already carries source-identity fields; ingest never re-stamps an already-ingested file.`,
      subject: notePath,
    });
  }
}

export class NoteNotTrackedError extends ContextureError {
  constructor(notePath: string) {
    super(ExitCode.Usage, {
      code: 'archive.not_tracked',
      severity: 'error',
      message: `Cannot archive "${notePath}": it is not yet tracked by git. Commit it first, then archive.`,
      subject: notePath,
    });
  }
}

export class ArchiveDestinationExistsError extends ContextureError {
  constructor(destinationPath: string) {
    super(ExitCode.Usage, {
      code: 'archive.destination_exists',
      severity: 'error',
      message: `Cannot archive: "${destinationPath}" already exists.`,
      subject: destinationPath,
    });
  }
}

export class AdapterNotFoundError extends ContextureError {
  constructor(kind: string, id: string) {
    super(ExitCode.Usage, {
      code: 'adapter.not_found',
      severity: 'error',
      message: `Configured adapter "${id}" (kind: ${kind}) is not a known adapter.`,
      subject: id,
      details: { kind },
    });
  }
}

export class AdapterVersionMismatchError extends ContextureError {
  constructor(kind: string, id: string, declaredVersion: number, supportedVersion: number) {
    super(ExitCode.Usage, {
      code: 'adapter.version_mismatch',
      severity: 'error',
      message: `Adapter "${id}" (kind: ${kind}) declares interface version ${declaredVersion}, but this contexture release supports version ${supportedVersion}.`,
      subject: id,
      details: { kind, declaredVersion, supportedVersion },
    });
  }
}

export class GraphNotBuiltError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'graph.not_built',
      severity: 'error',
      message: 'No graph artifact exists yet. Run "ctxr graph build" first.',
    });
  }
}

export class GraphNodeNotFoundError extends ContextureError {
  constructor(nodeId: string) {
    super(ExitCode.Usage, {
      code: 'graph.node_not_found',
      severity: 'error',
      message: `"${nodeId}" is not a node in the graph.`,
      subject: nodeId,
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
