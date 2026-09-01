import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import {
  DEFAULT_ADAPTERS,
  DEFAULT_ARCHIVE_PATH,
  DEFAULT_ROLLUP_STALE_DAYS,
  DEFAULT_CATALOG_PATH,
  DEFAULT_CATALOG_SECTION_MAX_BYTES,
  DEFAULT_BASELINE_CONVENTION_FILE_NAME,
  DEFAULT_CUSTOM_CONVENTION_FILE_NAME,
  DEFAULT_GUIDANCE_PATH,
  DEFAULT_DERIVED_PATHS,
  DEFAULT_DIFF_SIZE_CEILING_LINES,
  DEFAULT_EXCLUDE_PATHS,
  DEFAULT_HARD_WALLS,
  DEFAULT_INBOX_PATH,
  DEFAULT_TRACKING_PARAMS,
  DEFAULT_INTERNAL_AUDIENCES,
  DEFAULT_MISSION_PATH,
  DEFAULT_SKILLS_PATH,
  DEFAULT_RELATIONS,
  DEFAULT_GRAPH_SETTINGS,
  DEFAULT_SESSION_BRANCH_PREFIX,
  DEFAULT_VISIBILITY_CONTEXT,
  DEFAULT_VISIBILITY_FIELD_KEY,
  DEFAULT_WORKSPACES_EXTERNAL,
  DEFAULT_WORKTREES_PATH,
} from '../config/defaults.js';
import { configPathFor, readConfig } from '../config/load.js';
import { renderStoreConfig } from '../config/render.js';
import { SUPPORTED_SCHEMA_VERSION, TaxonomyLayerSchema, type StoreConfig, type TaxonomyLayerConfig } from '../config/schema.js';
import {
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsConventionsSection,
  buildAgentsLegRoutingSection,
  buildAgentsMissionSection,
  buildAgentsPlacementSection,
  agentsMdPath,
} from '../core/agents-doc.js';
import { seedCustomConventionFile, syncBaselineConvention } from '../core/convention-doc.js';
import { syncShippedSkills } from '../core/skills.js';
import { reconcileStore, WORKTREES_GITIGNORE_FENCE } from '../core/reconcile.js';
import type { Finding } from '../core/envelope.js';
import { isInteractive, type RunEnv } from '../core/env.js';
import {
  GitIdentityMissingError,
  InvalidTaxonomyFileError,
  TaxonomySelectionConflictError,
  UnknownTaxonomyProfileError,
} from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import { addPaths, commitIfStaged, currentBranch, findToplevel, gitInit, hasGitIdentity } from '../core/git/repo.js';
import { configureHooksPath, installHooks } from '../core/hooks.js';
import { DERIVED_GITIGNORE_FENCE } from '../core/markers.js';
import { resolveRootForInit } from '../core/root.js';
import { defaultProfile, DEFAULT_PROFILE_ID, profileById, SHIPPED_PROFILES } from '../taxonomy/profiles.js';

export const requires: CommandRequires = { store: 'absent' };

export interface InitFlags {
  root?: string;
  profile?: string;
  taxonomy?: string;
}

export interface InitData {
  root: string;
  already_initialized: boolean;
  created: string[];
  unchanged: string[];
  git: { repository_created: boolean; commit: string | null; default_branch: string | null };
  /** null when a custom taxonomy definition was supplied (no shipped profile applies). */
  taxonomy: { profile: string | null; layers: TaxonomyLayerConfig[] };
  schema_version: number;
}

const CustomTaxonomyFileSchema = z.object({ layers: z.array(TaxonomyLayerSchema) });

interface ResolvedTaxonomy {
  /** The value stored in contexture.yaml's taxonomy.profile — "custom" for a custom definition. */
  profileId: string;
  layers: TaxonomyLayerConfig[];
}

async function resolveTaxonomy(env: RunEnv, flags: InitFlags): Promise<ResolvedTaxonomy> {
  if (flags.profile && flags.taxonomy) {
    throw new TaxonomySelectionConflictError();
  }

  if (flags.taxonomy) {
    const text = await readFile(flags.taxonomy, 'utf8');
    const raw = parseYaml(text) as unknown;
    const result = CustomTaxonomyFileSchema.safeParse(raw);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '(root)',
        message: issue.message,
      }));
      throw new InvalidTaxonomyFileError(flags.taxonomy, issues);
    }
    return { profileId: 'custom', layers: result.data.layers };
  }

  if (flags.profile) {
    const profile = profileById(flags.profile);
    if (!profile) {
      throw new UnknownTaxonomyProfileError(
        flags.profile,
        SHIPPED_PROFILES.map((p) => p.id),
      );
    }
    return { profileId: profile.id, layers: [...profile.layers] };
  }

  if (isInteractive(env)) {
    const selectedId = await env.prompter.selectProfile({
      message: 'Choose a taxonomy profile for this store:',
      choices: SHIPPED_PROFILES.map((p) => ({ id: p.id, name: p.name, description: p.description })),
      defaultId: DEFAULT_PROFILE_ID,
    });
    const profile = profileById(selectedId) ?? defaultProfile();
    return { profileId: profile.id, layers: [...profile.layers] };
  }

  // Non-interactive, nothing specified: PARA immediately — never prompt, never block.
  const profile = defaultProfile();
  return { profileId: profile.id, layers: [...profile.layers] };
}

async function safeCurrentBranch(env: RunEnv, root: string): Promise<string | null> {
  try {
    return await currentBranch(env.git, root);
  } catch {
    return null;
  }
}

/**
 * compose-store-guidance-documents (context-organize delta): seeded once, at
 * fresh init, so `ctxr rollup write`/`ctxr rollup stale` have a file to
 * operate on from the start — an unwritten seed reports stale on elapsed
 * time alone (`checkMissionStaleness`), which is the correct "write your
 * first mission" signal, not a failure. Scoped to fresh init only: an
 * existing store that opts in later by hand creates its own file, exactly
 * as the pre-existing opt-in mechanism already required before this change.
 */
async function seedMissionDocument(root: string, missionPath: string): Promise<string | null> {
  const target = path.join(root, missionPath);
  if (existsSync(target)) return null;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, '---\ntitle: Mission\n---\n# Mission\n');
  return missionPath;
}

interface RunInitResult {
  data: InitData;
  findings: Finding[];
}

async function runInitCore(env: RunEnv, flags: InitFlags): Promise<RunInitResult> {
  const root = resolveRootForInit(env, flags);
  await mkdir(root, { recursive: true });
  const configPath = configPathFor(root);

  // --- Idempotent path: already initialized -----------------------------
  if (existsSync(configPath)) {
    const config = await readConfig(root); // validates + gates schema_version
    // Reconciling an existing store is exactly `ctxr update`'s job — one shared implementation.
    await reconcileStore(env, root, config);
    return {
      data: {
        root,
        already_initialized: true,
        created: [],
        unchanged: [],
        git: {
          repository_created: false,
          commit: null,
          default_branch: config.git.default_branch,
        },
        taxonomy: {
          profile: config.taxonomy.profile === 'custom' ? null : config.taxonomy.profile,
          layers: config.taxonomy.layers,
        },
        schema_version: config.schema_version,
      },
      findings: [],
    };
  }

  // --- Resolve taxonomy in memory, no writes yet -------------------------
  const taxonomy = await resolveTaxonomy(env, flags);

  // --- Git preflight, still no writes -------------------------------------
  const toplevel = await findToplevel(env.git, root);
  const findings: Finding[] = [];
  if (toplevel.kind === 'ancestor') {
    findings.push({
      code: 'git.ancestor_repository',
      severity: 'warning',
      message: `"${root}" is inside an existing git repository rooted at "${toplevel.toplevel}".`,
      subject: toplevel.toplevel,
    });
  }

  if (!(await hasGitIdentity(env.git, root, env.env))) {
    throw new GitIdentityMissingError();
  }

  // --- Mutate: create the repo so we can learn its default branch name ----
  const repositoryAlreadyExists = toplevel.kind === 'this-dir';
  if (!repositoryAlreadyExists) {
    await gitInit(env.git, root);
  }
  // Works even pre-commit: git init leaves HEAD pointing at an unborn branch.
  const defaultBranch = (await safeCurrentBranch(env, root)) ?? 'main';

  const config: StoreConfig = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    taxonomy: { profile: taxonomy.profileId, layers: taxonomy.layers },
    fields: { visibility: DEFAULT_VISIBILITY_FIELD_KEY },
    visibility: { default_context: DEFAULT_VISIBILITY_CONTEXT, directory_defaults: {}, contexts: {} },
    derived: { paths: [...DEFAULT_DERIVED_PATHS] },
    retrieval: { exclude_paths: [...DEFAULT_EXCLUDE_PATHS], relations: [...DEFAULT_RELATIONS], graph: { ...DEFAULT_GRAPH_SETTINGS, orphan_exempt_clusters: [] } },
    git: { default_branch: defaultBranch },
    session: { branch_prefix: DEFAULT_SESSION_BRANCH_PREFIX, worktrees_path: DEFAULT_WORKTREES_PATH, workspaces_external: DEFAULT_WORKSPACES_EXTERNAL },
    write_lifecycle: { diff_size_ceiling_lines: DEFAULT_DIFF_SIZE_CEILING_LINES, writable_paths: [] },
    catalog: { path: DEFAULT_CATALOG_PATH, section_max_bytes: DEFAULT_CATALOG_SECTION_MAX_BYTES },
    disclosure: { internal_audiences: [...DEFAULT_INTERNAL_AUDIENCES], hard_walls: [...DEFAULT_HARD_WALLS], leak_markers: {} },
    ingest: { inbox_path: DEFAULT_INBOX_PATH, tracking_params: [...DEFAULT_TRACKING_PARAMS] },
    organize: { archive_path: DEFAULT_ARCHIVE_PATH, rollup_stale_days: DEFAULT_ROLLUP_STALE_DAYS, mission_path: DEFAULT_MISSION_PATH },
    harness: { skills_path: DEFAULT_SKILLS_PATH, guidance_path: DEFAULT_GUIDANCE_PATH },
    adapters: [...DEFAULT_ADAPTERS],
  };
  // Round-trips through the schema internally; throws before any byte is written if it doesn't.
  const configText = renderStoreConfig(config);

  await writeFileAtomic(configPath, configText);
  const gitignorePath = path.join(root, '.gitignore');
  await upsertFencedRegionInFile(gitignorePath, DERIVED_GITIGNORE_FENCE, config.derived.paths);
  await upsertFencedRegionInFile(gitignorePath, WORKTREES_GITIGNORE_FENCE, [config.session.worktrees_path]);

  // Guidance-directory content must be current BEFORE the AGENTS.md sections
  // that read it (mission, store conventions) are built below.
  await syncBaselineConvention(root, config);
  const customConventionSeeded = await seedCustomConventionFile(root, config);
  const missionSeeded = config.organize.mission_path ? await seedMissionDocument(root, config.organize.mission_path) : null;

  // harness-portability spec "Generated sections render in a fixed order":
  // called in that order directly — a fresh AGENTS.md has no existing fences
  // to reorder, so call order alone determines the file's section order.
  await buildAgentsCanonicalSection(root, config);
  await buildAgentsMissionSection(root, config);
  await buildAgentsLegRoutingSection(root, config);
  await buildAgentsCaptureSection(root, config);
  await buildAgentsPlacementSection(root, config);
  const skillFilesCreated = await syncShippedSkills(root, config);
  await buildAgentsConventionsSection(root, config);

  const guidanceFilesCreated = [
    path.join(config.harness.guidance_path, DEFAULT_BASELINE_CONVENTION_FILE_NAME),
    ...(customConventionSeeded.created ? [path.join(config.harness.guidance_path, DEFAULT_CUSTOM_CONVENTION_FILE_NAME)] : []),
    ...(missionSeeded ? [missionSeeded] : []),
  ].map((p) => p.split(path.sep).join('/'));

  // One directory per configured layer with a .gitkeep — makes Zettelkasten's
  // zero-layer shape visibly different from PARA's at a glance. This is a
  // deliberate addition beyond tasks.md's literal text (0.6), noted here
  // rather than absorbed silently.
  const layerGitkeeps: string[] = [];
  for (const layer of config.taxonomy.layers) {
    const dir = path.join(root, layer.path);
    await mkdir(dir, { recursive: true });
    const gitkeepPath = path.join(dir, '.gitkeep');
    await writeFileAtomic(gitkeepPath, '');
    layerGitkeeps.push(path.join(layer.path, '.gitkeep'));
  }

  // Version-controlled hooks (write-lifecycle spec): generated now, staged
  // and committed below alongside the rest of the scaffold.
  const { changed: hookFiles } = await installHooks(root, defaultBranch);
  await configureHooksPath(env.git, root);

  const relConfigPath = path.relative(root, configPath);
  await addPaths(env.git, root, [
    relConfigPath,
    '.gitignore',
    path.relative(root, agentsMdPath(root)),
    ...layerGitkeeps,
    ...skillFilesCreated,
    ...guidanceFilesCreated,
    ...hookFiles,
  ]);

  const commitSha = await commitIfStaged(env.git, root, { kind: 'bootstrap' }, 'chore: initialize contexture store');

  return {
    data: {
      root,
      already_initialized: false,
      created: [
        relConfigPath,
        '.gitignore',
        path.relative(root, agentsMdPath(root)),
        ...layerGitkeeps,
        ...skillFilesCreated,
        ...guidanceFilesCreated,
        ...hookFiles,
      ],
      unchanged: [],
      git: { repository_created: !repositoryAlreadyExists, commit: commitSha, default_branch: defaultBranch },
      taxonomy: {
        profile: config.taxonomy.profile === 'custom' ? null : config.taxonomy.profile,
        layers: config.taxonomy.layers,
      },
      schema_version: config.schema_version,
    },
    findings,
  };
}

export async function execute(env: RunEnv, flags: InitFlags): Promise<CommandOutcome<InitData>> {
  const result = await runInitCore(env, flags);
  return {
    exitCode: ExitCode.Ok,
    data: result.data,
    findings: result.findings,
    humanSummary: result.data.already_initialized
      ? `"${result.data.root}" is already an initialized store.`
      : `Initialized contexture store at "${result.data.root}".`,
    storeRoot: result.data.root,
    schemaVersion: result.data.schema_version,
  };
}
