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
        'No store root found: checked --root, CONTEXTURE_STORE_ROOT, and walking up ' +
        `from "${checked.cwd}" looking for contexture.yaml.`,
      details: { checkedFlag: checked.flag, checkedEnv: checked.env, cwd: checked.cwd },
    });
  }
}

/**
 * rename-store-root-env-var D2: CONTEXTURE_ROOT is superseded by
 * CONTEXTURE_STORE_ROOT and is never resolved as a root — only refused, so
 * an environment migrated in part (the CLI renamed, some other reader of the
 * old name not yet updated) fails loudly instead of silently walking up and
 * resolving a different store.
 */
export class SupersededStoreRootEnvVarError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'root.superseded_env_var',
      severity: 'error',
      message:
        'CONTEXTURE_ROOT is set, but this release no longer recognizes it — rename it to ' +
        'CONTEXTURE_STORE_ROOT.',
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

/**
 * migrate-stores-on-update: one error for every older store, so the code a
 * caller matches on stays `config.schema_version.behind` whichever way the
 * remedy points. What varies is the remedy, carried in the message and in
 * `details.remedy`:
 *
 *   - `update`  the store is at or above the migration floor, so `ctxr update`
 *               carries it forward. Raised by every command except update.
 *   - `by_hand` the store is below the floor; nothing in this release can
 *               bring it forward. Raised by every command, update included.
 */
export class SchemaVersionBehindError extends ContextureError {
  constructor(storeVersion: number, supportedVersion: number, floor: number) {
    const withinFloor = storeVersion >= floor;
    super(ExitCode.Usage, {
      code: 'config.schema_version.behind',
      severity: 'error',
      message:
        `This store's schema_version (${storeVersion}) is older than the ` +
        `version this contexture release supports (${supportedVersion}). ` +
        (withinFloor
          ? 'Run `ctxr update` to bring it forward, or `ctxr update --worktree` to do it on a branch of its own.'
          : `This release can only bring forward a store recorded at ${floor} or later, so it cannot ` +
            'migrate this one: bring the store forward by hand, following the fixup in the release notes ' +
            'for each version that raised it.'),
      details: { storeVersion, supportedVersion, floor, remedy: withinFloor ? 'update' : 'by_hand' },
    });
  }
}

/** A schema migration step failed, or its result did not validate; nothing was written. */
export class SchemaMigrationFailedError extends ContextureError {
  constructor(configPath: string, detail: string) {
    super(ExitCode.Usage, {
      code: 'config.schema_version.migration_failed',
      severity: 'error',
      message: `Could not migrate "${configPath}", and it was left unchanged: ${detail}`,
      subject: configPath,
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
        'the schema-version requirement and is not supported by this release.',
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

/**
 * context-ingest spec: a store declared which section a capture of this
 * source type must carry, and this one does not carry it. `CheckFailed`, not
 * `Usage` — the command ran correctly and found a real problem with the
 * material, which is a different thing from being called wrongly.
 */
export class MissingRequiredCaptureSectionError extends ContextureError {
  constructor(capturePath: string, sourceType: string, section: string) {
    super(ExitCode.CheckFailed, {
      code: 'ingest.missing_required_capture_section',
      severity: 'error',
      message: `"${capturePath}" carries no "${section}" section, which this store requires of every "${sourceType}" capture before it can stand as provenance.`,
      subject: capturePath,
    });
  }
}

/**
 * context-ingest spec (harden-the-required-capture-section D2): the capture
 * already says what kind of source it came from, and the invocation says
 * something else. Ingest used to stamp the invocation's value over the
 * capture's own and say nothing, which also meant a store's declared required
 * section was looked up under whatever a caller typed. `CheckFailed`, like the
 * missing-section refusal: the command was called correctly and the material
 * contradicts itself.
 */
export class CaptureSourceTypeMismatchError extends ContextureError {
  constructor(capturePath: string, capturesOwn: string, invoked: string) {
    super(ExitCode.CheckFailed, {
      code: 'ingest.source_type_mismatch',
      severity: 'error',
      message: `"${capturePath}" says it came from a "${capturesOwn}" source but was ingested as "${invoked}"; make the capture and the --source-type agree, then ingest again.`,
      subject: capturePath,
    });
  }
}

export class SourceIdUnprefixedError extends ContextureError {
  constructor(sourceId: string, sourceType: string) {
    super(ExitCode.Usage, {
      code: 'ingest.source_id_unprefixed',
      severity: 'error',
      message: `--source-id "${sourceId}" does not begin with its source type; pass "${sourceType}/<id>" (for example "${sourceType}/${sourceId.replace(/^.*\//, '')}"), then ingest again.`,
      subject: sourceId,
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

export class AlreadyArchivedError extends ContextureError {
  constructor(relativePath: string, archiveDestination: string) {
    super(ExitCode.Usage, {
      code: 'archive.already_archived',
      severity: 'error',
      message: `Cannot archive: "${relativePath}" is already beneath the archive destination "${archiveDestination}".`,
      subject: relativePath,
    });
  }
}

export class CaptureFileMissingError extends ContextureError {
  constructor(sidecarPath: string, capturePath: string) {
    super(ExitCode.Usage, {
      code: 'ingest.capture_file_missing',
      severity: 'error',
      message: `"${sidecarPath}" names capture file "${capturePath}", which does not exist.`,
      subject: sidecarPath,
      details: { capturePath },
    });
  }
}

export class CaptureDestinationExistsError extends ContextureError {
  constructor(destinationPath: string) {
    super(ExitCode.Usage, {
      code: 'ingest.capture_destination_exists',
      severity: 'error',
      message: `Cannot retain the capture: "${destinationPath}" already exists.`,
      subject: destinationPath,
    });
  }
}

export class NoCommitToVerifyError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'verify.no_commit',
      severity: 'error',
      message:
        'There is no commit to verify: `verify --portable` checks out the store\'s recorded commit, and this repository has none yet. Commit the store, then re-run.',
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

/**
 * compose-the-retrieval-pass spec: a persisted graph that carries a note the
 * store no longer admits would serve excluded material to every graph query,
 * so the loader refuses it rather than filtering after the fact — a pre-filter
 * cannot be safely retrofitted from a post-filter. A graph merely MISSING a
 * newly added note is under-inclusive, withholds nothing, and still answers.
 */
export class GraphCarriesExcludedNoteError extends ContextureError {
  constructor(nodeIds: readonly string[]) {
    const named = [...nodeIds].sort();
    super(ExitCode.Usage, {
      code: 'graph.carries_excluded_note',
      severity: 'error',
      message: `The built graph carries ${named.length} note(s) the store no longer admits: ${named.join(', ')}. Run "ctxr graph build" to rebuild it.`,
      details: { nodes: named },
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
      message: '"ctxr publish gather" requires exactly one of --under, --note, or --entity.',
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

/** publish spec: `ctxr publish urls` names its change set exactly once. */
export class PublishChangeSetRequiredError extends ContextureError {
  constructor(given: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'publish.change_set_required',
      severity: 'error',
      message:
        given.length === 0
          ? '"ctxr publish urls" requires exactly one of --staged or --since <ref>.'
          : `"ctxr publish urls" accepts exactly one change set; given: ${given.join(', ')}.`,
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

/**
 * two-kinds-of-published-page D2: the `disposable` segment has exactly one way
 * in — `ctxr publish new --disposable` — so a slug spelled into it is refused.
 */
export class PublishDisposableSegmentReservedError extends ContextureError {
  constructor(slug: string) {
    super(ExitCode.Usage, {
      code: 'publish.disposable_segment_reserved',
      severity: 'error',
      message: `"${slug}" begins with "disposable/", a segment reserved for disposable pages — scaffold one with "ctxr publish new --disposable <name>", which supplies the date.`,
      subject: slug,
    });
  }
}

/**
 * two-kinds-of-published-page D2: a disposable page's name is one segment, and
 * its date is the command's to stamp — never the caller's.
 */
export class PublishDisposableNameError extends ContextureError {
  constructor(name: string, reason: 'multi-segment' | 'dated') {
    super(ExitCode.Usage, {
      code: 'publish.disposable_name',
      severity: 'error',
      message:
        reason === 'dated'
          ? `"${name}" begins with a date — "ctxr publish new --disposable" supplies today's date itself; give the name alone.`
          : `"${name}" is not a single folder name — a disposable page sits directly under "disposable/", with no grouping folders.`,
      subject: name,
      details: { reason },
    });
  }
}

export type PublishStampRefusal = 'disposable' | 'not-a-page' | 'no-readme' | 'no-link' | 'not-found' | 'ambiguous';

/**
 * two-kinds-of-published-page D5: `ctxr publish stamp` records a permanent
 * page's represented-note hash, and refuses — writing nothing — a page it
 * cannot stamp.
 */
export class PublishStampRefusedError extends ContextureError {
  constructor(relativePath: string, reason: PublishStampRefusal, detail = '') {
    const why: Record<PublishStampRefusal, string> = {
      disposable: 'it is a disposable page, which is frozen and never stamped',
      'not-a-page': 'it is not a page under the configured publish path',
      'no-readme': 'it has no sibling README',
      'no-link': 'its README links no note',
      'not-found': `its README's first wikilink names "${detail}", which no note in the store carries`,
      ambiguous: `its README's first wikilink resolves to more than one note: ${detail}`,
    };
    super(ExitCode.Usage, {
      code: 'publish.stamp_refused',
      severity: 'error',
      message: `"${relativePath}" was not stamped: ${why[reason]}.`,
      subject: relativePath,
      details: { reason },
    });
  }
}

/**
 * write-lifecycle spec: a session label that normalizes to nothing is refused
 * rather than dropped — dropping it would hand back a session named nothing like
 * what the caller asked for, with no indication that anything happened.
 */
export class SessionLabelUnusableError extends ContextureError {
  constructor(label: string) {
    super(ExitCode.Usage, {
      code: 'session.label_unusable',
      severity: 'error',
      message: `"${label}" has no letters or digits to name a session with — give a label like "ctx-a", or none at all.`,
      subject: label,
    });
  }
}

/**
 * write-lifecycle spec: a label that is already taken is refused, never adjusted
 * to fit (name-the-session-at-start design.md D4). Names the worktree as well as
 * the branch, because returning to the earlier session is the likely next step.
 */
export class SessionNameExistsError extends ContextureError {
  constructor(label: string, worktreePath: string) {
    super(ExitCode.Usage, {
      code: 'session.name_exists',
      severity: 'error',
      message: `A session labelled "${label}" already exists at "${worktreePath}" — work there, or start this one under another label.`,
      subject: label,
      details: { worktree: worktreePath },
    });
  }
}

/**
 * write-lifecycle spec: git refusing to create the worktree is reported as the
 * usage error it almost always is — the name it was handed — rather than as an
 * internal error, which is what an uncaught exec failure would produce. git's own
 * stderr rides in details rather than in the message, so the sentence stays about
 * what contexture asked for.
 */
export class SessionWorktreeRefusedError extends ContextureError {
  constructor(branch: string, worktreePath: string, stderr: string) {
    super(ExitCode.Usage, {
      code: 'session.worktree_refused',
      severity: 'error',
      message: `git refused to create the session worktree at "${worktreePath}" on branch "${branch}".`,
      subject: worktreePath,
      details: { branch, worktree: worktreePath, git_stderr: stderr.trim() },
    });
  }
}

/** review-the-knowledge-diff: the base of a graph diff is never assumed, so a range with no `--since` names nothing to compare. */
export class GraphDiffSinceRequiredError extends ContextureError {
  constructor() {
    super(ExitCode.Usage, {
      code: 'graph.diff_since_required',
      severity: 'error',
      message: '"ctxr graph diff" requires --since <ref>.',
    });
  }
}

/** review-the-knowledge-diff: `--since` or `--until` names something that is not a commit here. */
export class GraphDiffRefNotFoundError extends ContextureError {
  constructor(flag: '--since' | '--until', ref: string) {
    super(ExitCode.Usage, {
      code: 'graph.diff_ref_not_found',
      severity: 'error',
      message: `${flag} "${ref}" does not resolve to a commit.`,
      subject: ref,
      details: { flag, ref },
    });
  }
}

/** review-the-knowledge-diff: two refs whose histories never meet have no merge base to compare against. */
export class GraphDiffNoMergeBaseError extends ContextureError {
  constructor(since: string, head: string) {
    super(ExitCode.Usage, {
      code: 'graph.diff_no_merge_base',
      severity: 'error',
      message: `"${since}" and "${head}" share no merge base, so there is no base side to compare.`,
      details: { since, head },
    });
  }
}

/**
 * review-the-knowledge-diff (D9): `--format` names one of a fixed set of
 * forms, and `markdown` is the whole output with no envelope, so it cannot
 * be combined with `--json`.
 */
export class GraphDiffFormatError extends ContextureError {
  constructor(given: string, accepted: readonly string[], withJson: boolean) {
    super(ExitCode.Usage, {
      code: 'graph.diff_format',
      severity: 'error',
      message: withJson
        ? '"--format markdown" is the whole output and has no envelope, so it cannot be combined with --json.'
        : `--format "${given}" is not one of: ${accepted.join(', ')}.`,
      details: { given, accepted: [...accepted], json: withJson },
    });
  }
}

/** change-approval spec: the review and landing commands read decisions only a store that declares change approval has. */
export class ChangeApprovalNotDeclaredError extends ContextureError {
  constructor(command: string) {
    super(ExitCode.Usage, {
      code: 'change_approval.not_declared',
      severity: 'error',
      message: `"${command}" reads page decisions, and this store declares no change_approval block in contexture.yaml.`,
    });
  }
}

/** change-approval spec: an unreachable forge is reported as such, never as every pull request awaiting a decision. */
export class ForgeUnreachableError extends ContextureError {
  constructor(detail: string) {
    super(ExitCode.Usage, {
      code: 'forge.unreachable',
      severity: 'error',
      message: `The forge could not be reached through "gh": ${detail}`,
      details: { detail },
    });
  }
}

/** change-approval spec (design.md D4): serve records decisions only as the identity the store names. */
export class RecordingLoginMismatchError extends ContextureError {
  constructor(expected: string, actual: string) {
    super(ExitCode.Usage, {
      code: 'change_approval.recording_login_mismatch',
      severity: 'error',
      message: `change_approval.recording_login is "${expected}", but the forge credential this process holds authenticates as "${actual}".`,
      details: { expected, actual },
    });
  }
}

/** write-lifecycle spec: a refusal before any side effect — the default branch as head, a pull request that is not open, an unknown target. */
export class LandRefusedError extends ContextureError {
  constructor(reason: string, message: string, details: Record<string, unknown> = {}) {
    super(ExitCode.Usage, { code: `land.${reason}`, severity: 'error', message, details });
  }
}

/** write-lifecycle spec ("One landing runs per repository at a time"): a named pull request is not landed while another landing runs. */
export class LandBusyError extends ContextureError {
  constructor(pid: number, host: string) {
    super(ExitCode.CheckFailed, {
      code: 'land.busy',
      severity: 'error',
      message: `Another landing is running against this repository (process ${pid} on ${host}); nothing was done. Try again when it finishes.`,
      details: { pid, host },
    });
  }
}

/** write-lifecycle spec: `--pending` lands only recorded approvals, so `--confirm` cannot ride along. */
export class LandFlagsError extends ContextureError {
  constructor(message: string) {
    super(ExitCode.Usage, { code: 'land.flags', severity: 'error', message });
  }
}

/** change-approval spec (github-app-recording-identity): a GitHub App credential that is incomplete, ambiguous, unreadable, or refused. */
export class ForgeCredentialsError extends ContextureError {
  constructor(message: string, variables: readonly string[]) {
    super(ExitCode.Usage, {
      code: 'forge.credentials',
      severity: 'error',
      message,
      details: { variables: [...variables] },
    });
  }
}

/**
 * bring-the-session-lifecycle-into-the-cli D3: a session command's refusal —
 * the usage code for what the caller named (a session that is not one, a
 * branch another session carries, a body with a generated section's heading),
 * the failed-check code for what the session holds (uncommitted work discard
 * would destroy, a derived path in the index, a rebase in progress).
 */
export class SessionRefusedError extends ContextureError {
  constructor(exitCode: ExitCode, reason: string, message: string, details: Record<string, unknown> = {}, subject?: string) {
    super(exitCode, { code: `session.${reason}`, severity: 'error', message, details, ...(subject === undefined ? {} : { subject }) });
  }
}
