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

/**
 * session-capture-command spec (D2): a proposal file that cannot even be
 * read or parsed fails the whole command — there is nothing to apply item
 * by item. `detail` covers that case (a plain message: unreadable file,
 * unparseable YAML); `issues` covers the proposal parsing but failing
 * `CaptureProposalSchema` (unsupported keys, malformed note items) —
 * remove-agent-identity's zod-validated replacement for a hand-rolled key
 * filter, mirroring InvalidConfigError/InvalidTaxonomyFileError's shape.
 */
export class InvalidCaptureProposalError extends ContextureError {
  constructor(filePath: string, detail: string | readonly { path: string; message: string }[]) {
    const message =
      typeof detail === 'string'
        ? `"${filePath}" could not be read as a capture proposal: ${detail}.`
        : `"${filePath}" is not a valid capture proposal: ${detail.map((i) => `${i.path}: ${i.message}`).join('; ')}`;
    super(ExitCode.Usage, {
      code: 'session.capture.invalid_proposal',
      severity: 'error',
      message,
      subject: filePath,
      ...(typeof detail === 'string' ? {} : { details: { issues: detail } }),
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

export class SourceIdentityMissingError extends ContextureError {
  constructor(notePath: string) {
    super(ExitCode.Usage, {
      code: 'ingest.source_identity_missing',
      severity: 'error',
      message: `"${notePath}" carries no source identity yet; run "ctxr source stamp" before "ctxr source add-alt".`,
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

/** vendored-craft-skills spec: `--harness` names a harness this release does not ship an adapter for. */
export class UnknownHarnessError extends ContextureError {
  constructor(given: string, knownIds: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'init.unknown_harness',
      severity: 'error',
      message: `Unknown harness "${given}". Known harnesses: ${knownIds.join(', ')} (or "none").`,
      subject: given,
      details: { knownIds },
    });
  }
}

/** publish spec: `ctxr publish gather` accepts exactly one subject selector. */
export class PublishSelectorRequiredError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'publish.selector_required',
      severity: 'error',
      message: '"ctxr publish gather" requires exactly one of --under, --note, --entity, or --as.',
    });
  }
}

export class PublishSelectorConflictError extends ContextureError {
  constructor(given: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'publish.selector_conflict',
      severity: 'error',
      message: `"ctxr publish gather" accepts exactly one subject selector; given: ${given.join(', ')}.`,
      details: { given },
    });
  }
}

/**
 * publish spec: a living page's own name must not collide with the reserved
 * dated-snapshot naming pattern. `pageName` is the slug's final segment —
 * the page's own identity — which for a single-segment slug is the slug.
 */
export class PublishReservedSlugError extends ContextureError {
  constructor(slug: string, pageName: string = slug) {
    super(ExitCode.Usage, {
      code: 'publish.reserved_slug',
      severity: 'error',
      message: `"${pageName}" starts with a reserved date pattern (YYYY- or YYYY-MM-DD-) — that naming is reserved for frozen snapshots.`,
      subject: slug,
    });
  }
}

/** publish spec: a slug names a page's path under the publish path, and can never resolve outside it. */
export class PublishInvalidSlugError extends ContextureError {
  constructor(slug: string) {
    super(ExitCode.Usage, {
      code: 'publish.invalid_slug',
      severity: 'error',
      message: `"${slug}" is not a valid page path — name a folder, or a path of folders, under the publish path, with no empty, "." or ".." segment and no leading "/".`,
      subject: slug,
    });
  }
}

/** publish spec: a page folder is never silently overwritten. */
export class PublishSlugExistsError extends ContextureError {
  constructor(slug: string, relativePath: string) {
    super(ExitCode.Usage, {
      code: 'publish.slug_exists',
      severity: 'error',
      message: `A page folder already exists at "${relativePath}" — "ctxr publish new" never overwrites an existing page.`,
      subject: slug,
      details: { path: relativePath },
    });
  }
}

/** publish spec: `ctxr publish check` needs a page's index.html to exist before it can check anything. */
export class PublishPageNotFoundError extends ContextureError {
  constructor(relativePath: string) {
    super(ExitCode.Usage, {
      code: 'publish.page_not_found',
      severity: 'error',
      message: `"${relativePath}" does not exist.`,
      subject: relativePath,
    });
  }
}
