import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  AGENTS_MD_CANONICAL_FENCE,
  AGENTS_MD_IDENTITY_FENCE,
  AGENTS_MD_CAPTURE_FENCE,
  AGENTS_MD_LEG_ROUTING_FENCE,
  agentsMdPath,
  buildAgentsCanonicalSection,
  buildAgentsCaptureSection,
  buildAgentsIdentitySection,
  buildAgentsLegRoutingSection,
  renderCanonicalSection,
  renderCaptureSection,
  renderIdentitySection,
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
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    identity: { path: 'identity/', files: {}, entry_delimiter: '' },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
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

const SCANNED_PROCEDURES = [
  { path: 'procedures/ingest-orchestration.md', title: 'Ingest orchestration', description: null },
  { path: 'procedures/placement.md', title: 'Placement', description: null },
  { path: 'procedures/connection-finding.md', title: 'Connection finding', description: 'Find related notes.' },
  { path: 'procedures/organize-audit.md', title: 'Organize audit', description: null },
];

describe('renderCanonicalSection', () => {
  it('states the root-resolution rule naming --root and CONTEXTURE_ROOT', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_PROCEDURES).join('\n');
    expect(lines).toContain('--root');
    expect(lines).toContain('CONTEXTURE_ROOT');
    expect(lines).toContain('contexture.yaml');
  });

  it('points at the configured visibility field key, not a hardcoded one', () => {
    const lines = renderCanonicalSection(makeConfig({ fields: { visibility: 'lens' } }), SCANNED_PROCEDURES).join('\n');
    expect(lines).toContain('`lens:`');
  });

  it('states the write-path rule naming session start and session submit', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_PROCEDURES).join('\n');
    expect(lines).toMatch(/session start/);
    expect(lines).toMatch(/session submit/);
  });

  it('indexes every scanned procedure by title and path, with description when present', () => {
    const lines = renderCanonicalSection(makeConfig(), SCANNED_PROCEDURES).join('\n');
    expect(lines).toContain('[Ingest orchestration](procedures/ingest-orchestration.md)');
    expect(lines).toContain('[Placement](procedures/placement.md)');
    expect(lines).toContain('[Connection finding](procedures/connection-finding.md) — Find related notes.');
    expect(lines).toContain('[Organize audit](procedures/organize-audit.md)');
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
});

describe('renderIdentitySection (open-box identity)', () => {
  it('names all three identity file paths with a load-at-session-start instruction', () => {
    const lines = renderIdentitySection(makeConfig({ identity: { path: '.contexture/identity/', files: {}, entry_delimiter: '' } })).join('\n');
    expect(lines).toContain('`.contexture/identity/posture.md`');
    expect(lines).toContain('`.contexture/identity/world-facts.md`');
    expect(lines).toContain('`.contexture/identity/user-facts.md`');
    expect(lines).toMatch(/session start/i);
  });

  it('references by path only — no identity file content is inlined', () => {
    const lines = renderIdentitySection(makeConfig()).join('\n');
    expect(lines).not.toMatch(/Agent posture|Durable world facts|Durable user facts/);
  });

  it('regenerates against a custom identity path', () => {
    const lines = renderIdentitySection(makeConfig({ identity: { path: 'twin/', files: {}, entry_delimiter: '' } })).join('\n');
    expect(lines).toContain('`twin/posture.md`');
  });

  it('writes its own fenced section alongside the others', async () => {
    const tmp = await makeTmpDir();
    try {
      await buildAgentsCanonicalSection(tmp.root, makeConfig());
      await buildAgentsIdentitySection(tmp.root, makeConfig());
      const content = await readFile(agentsMdPath(tmp.root), 'utf8');
      expect(content).toContain(AGENTS_MD_CANONICAL_FENCE.start);
      expect(content).toContain(AGENTS_MD_IDENTITY_FENCE.start);
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
