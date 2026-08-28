import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { DEFAULT_DERIVED_PATHS, DEFAULT_EXCLUDE_PATHS, DEFAULT_VISIBILITY_CONTEXT, DEFAULT_VISIBILITY_FIELD_KEY } from '../config/defaults.js';
import { configPathFor, readConfig } from '../config/load.js';
import { renderStoreConfig } from '../config/render.js';
import { SUPPORTED_SCHEMA_VERSION, TaxonomyLayerSchema, type StoreConfig, type TaxonomyLayerConfig } from '../config/schema.js';
import { isInteractive, type RunEnv } from '../core/env.js';
import {
  GitIdentityMissingError,
  InvalidTaxonomyFileError,
  TaxonomySelectionConflictError,
  UnknownTaxonomyProfileError,
} from '../core/errors.js';
import { ExitCode } from '../core/exit-codes.js';
import type { Finding } from '../core/envelope.js';
import { writeFileAtomic } from '../core/fs/atomic.js';
import { upsertFencedRegionInFile } from '../core/fs/fenced-region.js';
import { addPaths, commitIfStaged, currentBranch, findToplevel, gitInit, hasGitIdentity } from '../core/git/repo.js';
import { DERIVED_GITIGNORE_FENCE } from '../core/markers.js';
import { resolveRootForInit } from '../core/root.js';
import { defaultProfile, profileById, SHIPPED_PROFILES, DEFAULT_PROFILE_ID } from '../taxonomy/profiles.js';
import { z } from 'zod';

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
    const gitignorePath = path.join(root, '.gitignore');
    await upsertFencedRegionInFile(gitignorePath, DERIVED_GITIGNORE_FENCE, config.derived.paths);
    return {
      data: {
        root,
        already_initialized: true,
        created: [],
        unchanged: [],
        git: {
          repository_created: false,
          commit: null,
          default_branch: await safeCurrentBranch(env, root),
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

  const config: StoreConfig = {
    schema_version: SUPPORTED_SCHEMA_VERSION,
    taxonomy: { profile: taxonomy.profileId, layers: taxonomy.layers },
    fields: { visibility: DEFAULT_VISIBILITY_FIELD_KEY },
    visibility: { default_context: DEFAULT_VISIBILITY_CONTEXT, directory_defaults: {} },
    derived: { paths: [...DEFAULT_DERIVED_PATHS] },
    retrieval: { exclude_paths: [...DEFAULT_EXCLUDE_PATHS] },
  };
  // Round-trips through the schema internally; throws before any byte is written if it doesn't.
  const configText = renderStoreConfig(config);

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

  // --- Mutate --------------------------------------------------------------
  const repositoryAlreadyExists = toplevel.kind === 'this-dir';
  if (!repositoryAlreadyExists) {
    await gitInit(env.git, root);
  }

  await writeFileAtomic(configPath, configText);
  const gitignorePath = path.join(root, '.gitignore');
  await upsertFencedRegionInFile(gitignorePath, DERIVED_GITIGNORE_FENCE, config.derived.paths);

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

  const relConfigPath = path.relative(root, configPath);
  await addPaths(env.git, root, [relConfigPath, '.gitignore', ...layerGitkeeps]);

  const commitSha = await commitIfStaged(env.git, root, { kind: 'bootstrap' }, 'chore: initialize contexture store');
  const branch = await safeCurrentBranch(env, root);

  return {
    data: {
      root,
      already_initialized: false,
      created: [relConfigPath, '.gitignore', ...layerGitkeeps],
      unchanged: [],
      git: { repository_created: !repositoryAlreadyExists, commit: commitSha, default_branch: branch },
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
