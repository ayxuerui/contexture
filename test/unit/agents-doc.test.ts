import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  AGENTS_MD_CANONICAL_FENCE,
  AGENTS_MD_CAPTURE_FENCE,
  AGENTS_MD_LEG_ROUTING_FENCE,
  AGENTS_MD_MISSION_FENCE,
  agentsMdPath,
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsLegRoutingSection,
  buildAgentsMissionSection,
  checkAgentsMdDrift,
  renderCanonicalSection,
  renderMissionSection,
  renderPlacementSection,
  renderCaptureSection,
  renderLegRoutingSection,
} from '../../src/core/agents-doc.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: ['identity/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    skills: { vendored: [] },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/' },
    adapters: [],
    ...overrides,
  };
}

describe('renderLegRoutingSection', () => {
  it('names the catalog, the graph, and direct content-matching as the two retrieval legs', () => {
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toMatch(/catalog/i);
    expect(lines).toMatch(/graph/i);
    expect(lines).toMatch(/grep/i);
  });

  it('states plainly that no search command exists', () => {
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toMatch(/no `ctxr search` command/i);
  });

  it('lists every declared exclusion path exactly once, as one compact line', () => {
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toContain('`identity/`');
    expect(lines).toContain('`.contexture/`');
    expect(lines.match(/`\.contexture\/`/g)).toHaveLength(1);
  });

  it('collapses a prefix already covered by an ancestor prefix', () => {
    const lines = renderLegRoutingSection(
      makeConfig({
        derived: { paths: ['.contexture/', '.contexture/cache/'] },
        catalog: { path: '.contexture/catalog/', section_max_bytes: 32768 },
      }),
    ).join('\n');
    expect(lines).toContain('`.contexture/`');
    expect(lines).not.toContain('`.contexture/cache/`');
    expect(lines).not.toContain('`.contexture/catalog/`');
  });

  it('preserves a bare file exclusion (no trailing slash) alongside directory prefixes', () => {
    const lines = renderLegRoutingSection(
      makeConfig({ retrieval: { exclude_paths: ['AGENTS.md', 'log.md'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } } }),
    ).join('\n');
    expect(lines).toContain('`AGENTS.md`');
    expect(lines).toContain('`log.md`');
    expect(lines).not.toContain('`AGENTS.md/`');
  });
});

describe('buildAgentsLegRoutingSection', () => {
  it('writes a fenced section into AGENTS.md at the store root', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain(AGENTS_MD_LEG_ROUTING_FENCE.start);
      expect(content).toContain(AGENTS_MD_LEG_ROUTING_FENCE.end);
      expect(content).toMatch(/no `ctxr search` command/i);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is convergent: rebuilding from unchanged config does not rewrite the file', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await buildAgentsLegRoutingSection(tmp.root, config);
      const filePath = agentsMdPath(tmp.root);
      const before = (await import('node:fs')).statSync(filePath).mtimeMs;
      await new Promise((r) => setTimeout(r, 10));
      const { changed } = await buildAgentsLegRoutingSection(tmp.root, config);
      const after = (await import('node:fs')).statSync(filePath).mtimeMs;
      expect(changed).toBe(false);
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });

  it('reconciles the section when the declared exclusion paths change', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      await buildAgentsLegRoutingSection(tmp.root, makeConfig({ retrieval: { exclude_paths: ['secrets/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } } }));
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain('`secrets/`');
      expect(content).not.toContain('`identity/`');
    } finally {
      await tmp.cleanup();
    }
  });

  it('preserves content outside the fenced region', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(tmp.root, { recursive: true });
      await writeFile(path.join(tmp.root, 'AGENTS.md'), '# My Store\n\nSome hand-written intro.\n');
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain('Some hand-written intro.');
      expect(content).toContain(AGENTS_MD_LEG_ROUTING_FENCE.start);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderCaptureSection', () => {
  it('names the configured inbox path and the four source-identity fields', () => {
    const lines = renderCaptureSection(makeConfig()).join('\n');
    expect(lines).toContain('`inbox/`');
    expect(lines).toContain('`source_type`');
    expect(lines).toContain('`source_id`');
    expect(lines).toContain('`source_hash`');
    expect(lines).toContain('`ingested`');
  });

  it('reflects a non-default inbox path', () => {
    const lines = renderCaptureSection(makeConfig({ ingest: { inbox_path: 'incoming/', tracking_params: [] } })).join('\n');
    expect(lines).toContain('`incoming/`');
  });
});

describe('buildAgentsCaptureSection', () => {
  it('writes a fenced section into AGENTS.md distinct from the leg-routing section', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      await buildAgentsCaptureSection(tmp.root, makeConfig());
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain(AGENTS_MD_LEG_ROUTING_FENCE.start);
      expect(content).toContain(AGENTS_MD_CAPTURE_FENCE.start);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderCanonicalSection', () => {
  it('states the root-resolution rule naming --root and CONTEXTURE_ROOT', () => {
    const lines = renderCanonicalSection(makeConfig()).join('\n');
    expect(lines).toContain('--root');
    expect(lines).toContain('CONTEXTURE_ROOT');
    expect(lines).toContain('contexture.yaml');
  });

  it('states the write-path rule naming session start and the ctxr-submit skill', () => {
    const lines = renderCanonicalSection(makeConfig()).join('\n');
    expect(lines).toMatch(/session start/);
    expect(lines).toMatch(/ctxr-submit/);
    expect(lines).not.toContain('ctxr session submit');
  });

  it('no longer carries a skill index', () => {
    const lines = renderCanonicalSection(makeConfig()).join('\n');
    expect(lines).not.toMatch(/skill index/i);
  });

  it('states the harness/store identity boundary for every config fixture used in this file', () => {
    for (const config of [
      makeConfig(),
      makeConfig({ fields: { visibility: 'lens' } }),
      makeConfig({ ingest: { inbox_path: 'incoming/', tracking_params: [] } }),
    ]) {
      const lines = renderCanonicalSection(config).join('\n');
      expect(lines).toMatch(/identity.*persona.*(durable )?cross-session memory/is);
      expect(lines).toMatch(/harness/i);
      expect(lines).not.toMatch(/identity\//); // no identity file or path of its own
    }
  });

  it('a second render is byte-identical: no rewrite from unchanged config', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await buildAgentsCanonicalSection(tmp.root, config);
      const { changed } = await buildAgentsCanonicalSection(tmp.root, config);
      expect(changed).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names the configured mission document, immediately after the boundary paragraph, only when set', () => {
    const withMission = renderCanonicalSection(makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } })).join('\n');
    expect(withMission).toContain('`MISSION.md`');
    expect(withMission).toMatch(/session start/);

    const withoutMission = renderCanonicalSection(makeConfig()).join('\n');
    expect(withoutMission).not.toMatch(/Load `.*` at the start of every session/);
  });
});

describe('buildAgentsCanonicalSection', () => {
  it('writes a fenced section distinct from the other three AGENTS.md sections', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      await buildAgentsCanonicalSection(tmp.root, makeConfig());
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain(AGENTS_MD_LEG_ROUTING_FENCE.start);
      expect(content).toContain(AGENTS_MD_CANONICAL_FENCE.start);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is convergent: rebuilding from unchanged config does not rewrite the file', async () => {
    const tmp = await makeTmpDir();
    try {
      const config = makeConfig();
      await buildAgentsCanonicalSection(tmp.root, config);
      const filePath = agentsMdPath(tmp.root);
      const before = (await import('node:fs')).statSync(filePath).mtimeMs;
      await new Promise((r) => setTimeout(r, 10));
      const { changed } = await buildAgentsCanonicalSection(tmp.root, config);
      const after = (await import('node:fs')).statSync(filePath).mtimeMs;
      expect(changed).toBe(false);
      expect(after).toBe(before);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('renderMissionSection / buildAgentsMissionSection', () => {
  it('renders nothing when unconfigured', () => {
    expect(renderMissionSection(makeConfig(), '# Mission\n\nSome content.\n')).toEqual([]);
  });

  it('renders nothing when configured but the note does not exist', () => {
    const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
    expect(renderMissionSection(config, null)).toEqual([]);
  });

  it('inlines the mission body under a "## Mission" heading with a source line, heading-demoted one level', () => {
    const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
    const lines = renderMissionSection(config, '# Mission\n\n## Primary mission\n\nDo the thing.\n').join('\n');
    expect(lines).toContain('## Mission');
    expect(lines).toContain('### Primary mission');
    expect(lines).toContain('Do the thing.');
    expect(lines).toContain('_Source: MISSION.md_');
  });

  it('strips a nested contexture fence but keeps its content', () => {
    const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
    const raw =
      '# Mission\n\n<!-- >>> contexture:rollup (managed — do not edit) >>> -->\n## Primary mission\n\nContent.\n<!-- <<< contexture:rollup <<< -->\n';
    const lines = renderMissionSection(config, raw).join('\n');
    expect(lines).not.toContain('contexture:rollup');
    expect(lines).toContain('### Primary mission');
    expect(lines).toContain('Content.');
  });

  it('buildAgentsMissionSection writes the fenced section from the note on disk', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      await mkdir(tmp.root, { recursive: true });
      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nCurrent priorities.\n');
      const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });

      const { changed } = await buildAgentsMissionSection(tmp.root, config);
      expect(changed).toBe(true);
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain(AGENTS_MD_MISSION_FENCE.start);
      expect(content).toContain('Current priorities.');
    } finally {
      await tmp.cleanup();
    }
  });

  it('a second build reports no change when the note is unchanged', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      await mkdir(tmp.root, { recursive: true });
      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nStable.\n');
      const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });

      await buildAgentsMissionSection(tmp.root, config);
      const { changed } = await buildAgentsMissionSection(tmp.root, config);
      expect(changed).toBe(false);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('checkAgentsMdDrift', () => {
  it('reports no drift for a synchronized store', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      const config = makeConfig();
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await write(path.join(tmp.root, 'guidance/style.md'), '---\ntitle: Style\n---\nBody.\n');
      const { buildAgentsConventionsSection } = await import('../../src/core/agents-doc.js');
      await buildAgentsConventionsSection(tmp.root, config);

      const drift = await checkAgentsMdDrift(tmp.root, config);
      expect(drift.driftedConventions).toEqual([]);
      expect(drift.driftedMission).toBeNull();
    } finally {
      await tmp.cleanup();
    }
  });

  it('names a convention file edited without regenerating AGENTS.md', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      const config = makeConfig();
      await mkdir(path.join(tmp.root, 'guidance'), { recursive: true });
      await write(path.join(tmp.root, 'guidance/style.md'), '---\ntitle: Style\n---\nOriginal.\n');
      const { buildAgentsConventionsSection } = await import('../../src/core/agents-doc.js');
      await buildAgentsConventionsSection(tmp.root, config);

      await write(path.join(tmp.root, 'guidance/style.md'), '---\ntitle: Style\n---\nChanged.\n');

      const drift = await checkAgentsMdDrift(tmp.root, config);
      expect(drift.driftedConventions).toEqual(['guidance/style.md']);
    } finally {
      await tmp.cleanup();
    }
  });

  it('names the mission path when its note is edited without regenerating AGENTS.md', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile: write } = await import('node:fs/promises');
      await mkdir(tmp.root, { recursive: true });
      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nOriginal.\n');
      const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
      await buildAgentsMissionSection(tmp.root, config);

      await write(path.join(tmp.root, 'MISSION.md'), '# Mission\n\nChanged.\n');

      const drift = await checkAgentsMdDrift(tmp.root, config);
      expect(drift.driftedMission).toBe('MISSION.md');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('graph-context-document: the retrieval section names the graph document', () => {
  it('points agents at the rendered document and the cluster/bridge queries', async () => {
    const { renderLegRoutingSection } = await import('../../src/core/agents-doc.js');
    const { GRAPH_DOCUMENT_RELATIVE_PATH } = await import('../../src/core/graph/persist.js');
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toContain(GRAPH_DOCUMENT_RELATIVE_PATH);
    expect(lines).toContain('clusters, bridges');
  });
});

describe('reorderFencedRegionsInFile (via reconcileStore section order)', () => {
  it('a first-time init writes sections in the fixed order: fundamentals, mission, retrieval, capture, placement, conventions', async () => {
    const tmp = await makeTmpDir();
    try {
      const { execute: init } = await import('../../src/commands/init.js');
      const { makeFakeEnv } = await import('../helpers/fake-env.js');
      const env = makeFakeEnv({
        cwd: tmp.root,
        env: { GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com' },
      });
      await init(env, { root: tmp.root, profile: 'para' });

      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      const order = ['contexture:canonical', 'contexture:retrieval-leg-routing', 'contexture:capture-and-ingest', 'contexture:placement', 'contexture:conventions']
        .map((marker) => content.indexOf(marker))
        .filter((idx) => idx >= 0);
      expect(order).toEqual([...order].sort((a, b) => a - b));
    } finally {
      await tmp.cleanup();
    }
  });

  it('reorders a drifted but contiguous store on update, preserving hand-written content outside every managed section', async () => {
    const tmp = await makeTmpDir();
    try {
      // Write sections out of order directly, simulating a store seeded before the fixed order existed.
      await buildAgentsCaptureSection(tmp.root, makeConfig());
      await buildAgentsLegRoutingSection(tmp.root, makeConfig());
      await buildAgentsCanonicalSection(tmp.root, makeConfig());
      const before = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(before.indexOf('contexture:capture-and-ingest')).toBeLessThan(before.indexOf('contexture:canonical'));

      const { reconcileStore } = await import('../../src/core/reconcile.js');
      const { makeFakeEnv } = await import('../helpers/fake-env.js');
      const env = makeFakeEnv({ cwd: tmp.root, env: {} });
      await reconcileStore(env, tmp.root, makeConfig());

      const after = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(after.indexOf('contexture:canonical')).toBeLessThan(after.indexOf('contexture:retrieval-leg-routing'));
      expect(after.indexOf('contexture:retrieval-leg-routing')).toBeLessThan(after.indexOf('contexture:capture-and-ingest'));
    } finally {
      await tmp.cleanup();
    }
  });

  it('leaves order unchanged when hand-written content sits between two managed sections', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsCaptureSection(tmp.root, makeConfig());
      await buildAgentsCanonicalSection(tmp.root, makeConfig());
      const before = await readFile(agentsMdPath(tmp.root), 'utf8');
      const interrupted = before.replace(
        '<!-- <<< contexture:capture-and-ingest <<< -->',
        '<!-- <<< contexture:capture-and-ingest <<< -->\n\nA hand-written paragraph an operator added here.\n',
      );
      await writeFile(agentsMdPath(tmp.root), interrupted);

      const { reconcileStore } = await import('../../src/core/reconcile.js');
      const { makeFakeEnv } = await import('../helpers/fake-env.js');
      const env = makeFakeEnv({ cwd: tmp.root, env: {} });
      await reconcileStore(env, tmp.root, makeConfig());

      const after = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(after).toContain('A hand-written paragraph an operator added here.');
      // Order preserved: capture still before canonical, since reordering was blocked.
      expect(after.indexOf('contexture:capture-and-ingest')).toBeLessThan(after.indexOf('contexture:canonical'));
    } finally {
      await tmp.cleanup();
    }
  });
});

/**
 * inline-conventions-and-mission: exact-output assertions. The `toContain`
 * checks above still pass against output with a dropped blank line, a
 * doubled blank line, or a raw `__PLACEHOLDER__` left in it — these do not.
 * Asserting on the line array rather than the joined string is deliberate:
 * a blank-line count change is invisible in a joined-string diff and
 * obvious here.
 */
describe('exact rendered output', () => {
  it('renders the leg-routing section', () => {
    expect(renderLegRoutingSection(makeConfig())).toEqual([
      "## Retrieval: which leg to use",
      "",
      "contexture builds and maintains two retrieval tools ahead of time — consult them first:",
      "",
      "- **Catalog** (`ctxr catalog show --section <id>`): a curated, coverage-guaranteed index of every retrievable note, one section per taxonomy layer.",
      "- **Graph** (`ctxr graph query ...`): the wikilink graph between notes — neighbors, shortest path, hubs, orphans, clusters, bridges; `--type <relation>` follows one configured relation.",
      "- **Graph document** (`.contexture/cache/graph.md`, rebuilt by `ctxr graph build`): hub notes by cluster, cross-cluster bridges, and orphans — read it for cluster context before writing.",
      "",
      "For a literal or entity question the catalog and graph do not answer (a specific string, an exact identifier, a phrase),",
      "use your own direct content-matching tool (e.g. grep/ripgrep) against the store, scoped to exclude:",
      "",
      "`.contexture/`, `.worktrees/`, `catalog/`, `guidance/`, `identity/`, `publish/`, `skills/`",
      "",
      "There is no `ctxr search` command. Ranked or semantic search is deferred to a future version — do not look for one.",
    ]);
  });

  it('renders the capture section', () => {
    expect(renderCaptureSection(makeConfig())).toEqual([
      "## Capturing and ingesting new material",
      "",
      "To capture something new, write a plain markdown file directly into `inbox/` —",
      "no CLI command wraps this. That file MUST NOT contain any of these frontmatter fields; contexture assigns",
      "them once, at ingest, and never before:",
      "",
      "- `source_type`",
      "- `source_id`",
      "- `source_hash`",
      "- `ingested`",
      "",
      "Before ingesting, run `ctxr source check <path> --source-id <id>` to get one of four verdicts:",
      "`new`, `already_ingested`, `alternate_source_match`, or `multiple_matches` — the last one means stop and",
      "resolve the ambiguity yourself rather than guessing which existing note it is.",
      "",
      "To ingest, run `ctxr ingest <path> --source-type <type> --source-id <id>`. It stamps the four fields",
      "above onto the file in place and rebuilds the catalog, so the result already has a catalog entry.",
    ]);
  });

  it('renders the placement section for a store that declares no layers', () => {
    expect(renderPlacementSection(makeConfig())).toEqual([
      "## Placing a new note",
      "",
      "This store's taxonomy declares no top-level layers — place new notes directly at the store root (or",
      "wherever related notes already live) and rely on wikilinks and `ctxr graph` for organization,",
      "rather than a folder hierarchy.",
    ]);
  });

  it('renders the placement section from the configured layers', () => {
    const config = makeConfig({
      taxonomy: {
        profile: 'para',
        layers: [
          { name: 'Projects', path: 'projects', description: 'Active efforts with an end state.' },
          { name: 'Areas', path: 'areas', description: 'Ongoing responsibilities.' },
        ],
      },
    });
    expect(renderPlacementSection(config)).toEqual([
      "## Placing a new note",
      "",
      "This store's taxonomy declares these layers — choose the one whose description best matches the note:",
      "",
      "- **Projects** (`projects/`): Active efforts with an end state.",
      "- **Areas** (`areas/`): Ongoing responsibilities.",
      "",
      "If no layer fits, use the store's uncategorized/catch-all location and revisit placement later.",
    ]);
  });

  it('renders the canonical section with no mission configured', () => {
    expect(renderCanonicalSection(makeConfig())).toEqual([
      "## Store fundamentals",
      "",
      "### Root resolution",
      "",
      "Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory looking for `contexture.yaml`. No other flag or environment variable selects the root.",
      "",
      "### Frontmatter schema",
      "",
      "- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.",
      "",
      "### Write path",
      "",
      "Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, then `ctxr-submit` validates with `ctxr doctor`, commits, pushes, and opens (or reports how to open) a pull request. Do not edit files in the store root directly.",
      "",
      "### Identity and memory",
      "",
      "Identity, persona, and durable cross-session memory for the agent working this store belong to its harness, not to this store — the store holds knowledge and skills, documented as portable markdown under `skills/`, never a persona or memory file of its own.",
    ]);
  });

  it('renders the canonical section with a mission document configured', () => {
    const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
    const lines = renderCanonicalSection(config);
    expect(lines.at(-1)).toBe(
      'Load `MISSION.md` at the start of every session — this store\'s standing current-state document, kept current by the mission skill and written through `ctxr rollup write`; its full content follows in the "Mission" section below.',
    );
    expect(lines.at(-2)).toBe('');
  });

  it('renders the mission section', () => {
    const config = makeConfig({ organize: { archive_destination: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } });
    expect(renderMissionSection(config, '# Mission\n\nCurrent priorities.\n')).toEqual([
      "## Mission",
      "",
      "Current priorities.",
      "",
      "_Source: MISSION.md_",
    ]);
  });
});
