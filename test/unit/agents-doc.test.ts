import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  AGENTS_MD_CANONICAL_FENCE,
  AGENTS_MD_CAPTURE_FENCE,
  AGENTS_MD_LEG_ROUTING_FENCE,
  agentsMdPath,
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsLegRoutingSection,
  renderCanonicalSection,
  renderPlacementSection,
  renderCaptureSection,
  renderLegRoutingSection,
} from '../../src/core/agents-doc.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'private', directory_defaults: {}, contexts: {} },
    derived: { paths: ['.contexture/'] },
    retrieval: { exclude_paths: ['identity/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/', workspaces_external: false },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', conventions_path: 'conventions/' },
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

  it('lists every declared exclusion path exactly once', () => {
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toContain('`identity/`');
    expect(lines).toContain('`.contexture/`');
    expect(lines.match(/`\.contexture\/`/g)).toHaveLength(1);
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

const SCANNED_SKILLS = [
  { path: 'skills/ingest-orchestration.md', title: 'Ingest orchestration', description: null },
  { path: 'skills/placement.md', title: 'Placement', description: null },
  { path: 'skills/connection-finding.md', title: 'Connection finding', description: 'Find related notes.' },
  { path: 'skills/organize-audit.md', title: 'Organize audit', description: null },
];

describe('renderCanonicalSection', () => {
  it('states the root-resolution rule naming --root and CONTEXTURE_ROOT', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_SKILLS).join('\n');
    expect(lines).toContain('--root');
    expect(lines).toContain('CONTEXTURE_ROOT');
    expect(lines).toContain('contexture.yaml');
  });

  it('points at the configured visibility field key, not a hardcoded one', () => {
    const lines = renderCanonicalSection(makeConfig({ fields: { visibility: 'lens' } }), SCANNED_SKILLS).join('\n');
    expect(lines).toContain('`lens:`');
  });

  it('states the write-path rule naming session start and session submit', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_SKILLS).join('\n');
    expect(lines).toMatch(/session start/);
    expect(lines).toMatch(/session submit/);
  });

  it('indexes every scanned skill by title and path, with description when present', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_SKILLS).join('\n');
    expect(lines).toContain('[Ingest orchestration](skills/ingest-orchestration.md)');
    expect(lines).toContain('[Placement](skills/placement.md)');
    expect(lines).toContain('[Connection finding](skills/connection-finding.md) — Find related notes.');
    expect(lines).toContain('[Organize audit](skills/organize-audit.md)');
  });

  it('states the harness/store identity boundary for every config fixture used in this file', () => {
    for (const config of [
      makeConfig(),
      makeConfig({ fields: { visibility: 'lens' } }),
      makeConfig({ ingest: { inbox_path: 'incoming/', tracking_params: [] } }),
    ]) {
      const lines = renderCanonicalSection(config, SCANNED_SKILLS).join('\n');
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
    const withMission = renderCanonicalSection(makeConfig({ organize: { archive_path: 'archive/', rollup_stale_days: 7, mission_path: 'MISSION.md' } }), SCANNED_SKILLS).join('\n');
    expect(withMission).toContain('`MISSION.md`');
    expect(withMission).toMatch(/session start/);

    const withoutMission = renderCanonicalSection(makeConfig(), SCANNED_SKILLS).join('\n');
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

  /**
   * rename-procedures-to-skills (task 5.3): the skill-index heading and its
   * __SKILLS_PATH__ placeholder both changed text in this release — this is
   * what proves the rewrite converges instead of re-diffing on every run
   * (e.g. a stray placeholder or an extra blank line would make every
   * regeneration report changed: true forever).
   */
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

describe('graph-context-document: the retrieval section names the graph document', () => {
  it('points agents at the rendered document and the cluster/bridge queries', async () => {
    const { renderLegRoutingSection } = await import('../../src/core/agents-doc.js');
    const { GRAPH_DOCUMENT_RELATIVE_PATH } = await import('../../src/core/graph/persist.js');
    const lines = renderLegRoutingSection(makeConfig()).join('\n');
    expect(lines).toContain(GRAPH_DOCUMENT_RELATIVE_PATH);
    expect(lines).toContain('clusters, bridges');
  });
});

/**
 * extract-agents-doc-templates: exact-output assertions. The `toContain`
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
      "- `identity/`",
      "- `.contexture/`",
      "- `.worktrees/`",
      "- `catalog/`",
      "- `skills/`",
      "- `conventions/`",
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

  it('renders the placement section for layers with and without a directory default', () => {
    const config = makeConfig({
      taxonomy: {
        profile: 'para',
        layers: [
          { name: 'Projects', path: 'projects', description: 'Active efforts with an end state.' },
          { name: 'Areas', path: 'areas', description: 'Ongoing responsibilities.' },
        ],
      },
      visibility: { default_context: 'private', directory_defaults: { projects: 'work' }, contexts: {} },
    });
    expect(renderPlacementSection(config)).toEqual([
      "## Placing a new note",
      "",
      "This store's taxonomy declares these layers — choose the one whose description best matches the note:",
      "",
      "- **Projects** (`projects/`): Active efforts with an end state. Notes here default to visibility \"work\" unless given an explicit value.",
      "- **Areas** (`areas/`): Ongoing responsibilities.",
      "",
      "If no layer fits, use the store's uncategorized/catch-all location and revisit placement later.",
    ]);
  });

  it('renders the canonical section with an empty skill index, adding no trailing blank line', () => {
    expect(renderCanonicalSection(makeConfig(), [])).toEqual([
      "## Store fundamentals",
      "",
      "### Root resolution",
      "",
      "Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory looking for `contexture.yaml`. No other flag or environment variable selects the root.",
      "",
      "### Frontmatter schema",
      "",
      "- Visibility field: `scope:` — resolves explicit value, then directory default, then the configured fail-closed default (`private`). See `ctxr note resolve <path>`.",
      "- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.",
      "- Disclosure audience tags (optional, hand-written): `audience: [<name>, ...]`.",
      "",
      "### Write path",
      "",
      "Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, then `ctxr session submit` validates, commits, pushes, and opens (or reports how to open) a pull request. Do not edit files in the store root directly.",
      "",
      "### Identity and memory",
      "",
      "Identity, persona, and durable cross-session memory for the agent working this store belong to its harness, not to this store — the store holds knowledge and procedures, documented as portable markdown under `skills/` (see the skill index below), never a persona or memory file of its own.",
      "",
      "### Skill index",
      "",
      "Judgment-driven operations, documented as portable markdown under `skills/` — read one directly, no harness-specific discovery required:",
      "",
    ]);
  });

  it('renders the canonical section with a populated skill index', () => {
    expect(renderCanonicalSection(makeConfig(), SCANNED_SKILLS)).toEqual([
      "## Store fundamentals",
      "",
      "### Root resolution",
      "",
      "Every contexture command resolves the store root in this order: an explicit `--root <path>` flag; the `CONTEXTURE_ROOT` environment variable; walking up from the current directory looking for `contexture.yaml`. No other flag or environment variable selects the root.",
      "",
      "### Frontmatter schema",
      "",
      "- Visibility field: `scope:` — resolves explicit value, then directory default, then the configured fail-closed default (`private`). See `ctxr note resolve <path>`.",
      "- Source-identity fields (assigned only by `ctxr ingest`, never hand-written): `source_type`, `source_id`, `source_hash`, `ingested`.",
      "- Disclosure audience tags (optional, hand-written): `audience: [<name>, ...]`.",
      "",
      "### Write path",
      "",
      "Every write to this store happens inside a session worktree, never directly on the default branch: `ctxr session start` creates one, then `ctxr session submit` validates, commits, pushes, and opens (or reports how to open) a pull request. Do not edit files in the store root directly.",
      "",
      "### Identity and memory",
      "",
      "Identity, persona, and durable cross-session memory for the agent working this store belong to its harness, not to this store — the store holds knowledge and procedures, documented as portable markdown under `skills/` (see the skill index below), never a persona or memory file of its own.",
      "",
      "### Skill index",
      "",
      "Judgment-driven operations, documented as portable markdown under `skills/` — read one directly, no harness-specific discovery required:",
      "",
      "- [Ingest orchestration](skills/ingest-orchestration.md)",
      "- [Placement](skills/placement.md)",
      "- [Connection finding](skills/connection-finding.md) — Find related notes.",
      "- [Organize audit](skills/organize-audit.md)",
    ]);
  });
});
