import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  MANAGED_SKILL_HEADER,
  procedurePaths,
  PROCEDURES,
  renderProcedures,
  retiredLayers,
  syncShippedSkills,
  terminatingLayers,
} from '../../src/core/procedures.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from '../../src/core/graph/persist.js';
import { SHIPPED_PROFILES } from '../../src/taxonomy/profiles.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

/**
 * The content tests render against a PLACEHOLDER taxonomy (layer names no
 * shipped profile uses) so that any shipped layer name found in the output
 * can only have come from the skill source itself — which is exactly what
 * owned-skills-expansion D3 forbids.
 */
function makeConfig(overrides: Partial<StoreConfig> = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: {
      profile: 'custom',
      layers: [
        { name: 'Alpha', path: 'alpha', description: 'Active work with a defined end state.' },
        { name: 'Beta', path: 'beta', description: 'Ongoing responsibilities with a standard to maintain.' },
        { name: 'Gamma', path: 'gamma', description: 'Completed, abandoned, or inactive items.' },
      ],
    },
    fields: { visibility: 'scope' },
    visibility: { default_context: 'ctx-default', directory_defaults: {}, contexts: {} },
    derived: { paths: [] },
    retrieval: { exclude_paths: ['procedures/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'trunk' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    disclosure: { internal_audiences: [], hard_walls: [], leak_markers: {} },
    ingest: { inbox_path: 'inbox/', tracking_params: [] },
    organize: { archive_path: 'archive/', rollup_stale_days: 7 },
    harness: { procedures_path: 'procedures/', conventions_path: 'conventions/' },
    adapters: [],
    ...overrides,
  };
}

function rendered(config = makeConfig()): Record<string, string> {
  return Object.fromEntries(renderProcedures(config).map((p) => [p.file, p.content]));
}

const SHIPPED_NAMES = [...new Set(SHIPPED_PROFILES.flatMap((p) => [p.name, ...p.layers.map((l) => l.name)]))];

/** Words a real deployment uses as visibility values; a skill may only ever say `<context>` / `<value>`. */
const TIER_WORDS = ['personal', 'private', 'public', 'shared', 'internal', 'team', 'confidential'];

describe('PROCEDURES', () => {
  it('names the eleven owned skills, in index order', () => {
    expect(PROCEDURES.map((p) => p.file)).toEqual([
      'ctxr-ingest-orchestration',
      'ctxr-placement',
      'ctxr-connection-finding',
      'ctxr-connection-proposal',
      'ctxr-rollup',
      'ctxr-session-lifecycle',
      'ctxr-submit',
      'ctxr-land',
      'ctxr-session-capture',
      'ctxr-derived-artifacts',
      'ctxr-organize-audit',
    ]);
  });

  it('every rendered skill carries frontmatter, the managed header, and its H1', () => {
    for (const p of renderProcedures(makeConfig())) {
      expect(p.content.startsWith(`---\nname: ${p.file}\ndescription: ${p.description}\n---\n`)).toBe(true);
      expect(p.content).toContain(MANAGED_SKILL_HEADER);
      expect(p.content).toContain(`\n# ${p.name}\n`);
      expect(p.description).not.toMatch(/: /); // a plain YAML scalar — no "key: value" inside it
    }
  });
});

describe('owned-skills-expansion: each skill carries its load-bearing rule (task 2.1)', () => {
  const skills = rendered();

  it('placement: the visibility-collision merge test, visibility as an input, sub-item promotion, perishable routing, sibling style', () => {
    const s = skills['ctxr-placement'];
    expect(s).toMatch(/If\s+they differ, do NOT merge/);
    expect(s).toContain('no safe default');
    expect(s).toContain('Visibility can override location');
    expect(s).toContain('Promote to its own top-level location');
    expect(s).toContain('fenced `contexture:<region>` block you OVERWRITE');
    expect(s).toContain('Read one or two sibling notes');
    expect(s).toContain('`ctxr note resolve <path>`');
  });

  it('connection proposal: reads before it proposes, groups by the configured vocabulary with a single fallback group, confirms before writing', () => {
    const s = skills['ctxr-connection-proposal'];
    expect(s).toContain('Read every candidate before proposing it');
    expect(s).toContain('relation vocabulary'); // configured or absent, the grouping is always stated against the config
    expect(s).toContain('single **Related** group');
    expect(s).toContain('Confirm before writing');
    expect(s).toContain('`ctxr graph query orphans`');
  });

  it('rollup: resolve-never-create, non-entity refusal, minimum-source pushback, read-all, skip-when-empty, provenance', () => {
    const s = skills['ctxr-rollup'];
    expect(s).toContain('Resolve, never create');
    expect(s).toContain('Refuse non-entities');
    expect(s).toMatch(/Fewer\s+than 3 accepted sources → push back/);
    expect(s).toContain('Read EVERY accepted source, not a sample');
    expect(s).toContain('skip any empty subsection');
    expect(s).toContain('every fact traceable to a source note');
    expect(s).toContain('`ctxr rollup gather <entity>`');
    expect(s).toContain('`ctxr rollup write <entity> --content-file <file>`');
  });

  it('session lifecycle: start, re-scan discipline, conflict playbook, sequencing, reclaiming — and none of ctxr-submit/ctxr-land\'s own steps (session-submit-and-land D4)', () => {
    const s = skills['ctxr-session-lifecycle'];
    expect(s).toContain('## Start');
    expect(s).toContain('## Re-scan before any plan');
    expect(s).toContain('## Conflict playbook');
    expect(s).toContain('## Multi-PR sequencing');
    expect(s).toContain('## Reclaiming');
    expect(s).toContain('`git log --oneline origin/trunk..HEAD`'); // the CONFIGURED default branch, not a hardcoded one
    expect(s).toContain('git rebase origin/trunk`');
    expect(s).not.toMatch(/\bgit commit\b/); // D4: the CLI commits; no skill instructs a direct commit
    expect(s).not.toMatch(/\bgit push\b(?! --force-with-lease)/);
    // this skill references the two seam verbs but does not repeat their steps
    expect(s).toContain('`ctxr-submit`');
    expect(s).toContain('`ctxr-land`');
    expect(s).not.toContain('ctxr session submit');
    expect(s).not.toContain('ctxr session land');
  });

  it('submit: re-scans, runs the capture procedure exactly once, stages named paths, gates, and ends in ctxr session submit (session-submit-and-land)', () => {
    const s = skills['ctxr-submit'];
    expect(s).toContain('Re-scan (mandatory');
    expect((s?.match(/ctxr-session-capture/g) ?? []).length).toBe(1); // invoked once, not described twice
    expect(s).toContain('never `git add -A`');
    expect(s).toContain('plan consent is not fire consent');
    expect(s).toContain('`ctxr session submit --branch');
    expect(s).toContain('Verify before any retry');
    expect(s).not.toMatch(/\bgit commit\b/);
    expect(s).not.toMatch(/\bgit push\b/);
  });

  it('land: ends in ctxr session land, routes conflicts to the lifecycle skill, and never instructs a manual merge (session-submit-and-land)', () => {
    const s = skills['ctxr-land'];
    expect(s).toContain('`ctxr session land`');
    expect(s).toContain('ctxr-session-lifecycle');
    expect(s).toContain('conflict');
    expect(s).toMatch(/Never merge by hand/i);
    expect(s).not.toMatch(/\bgh pr merge\b/);
    expect(s).not.toMatch(/\bgit merge\b/);
  });

  it('session capture: trigger/anti-trigger taxonomy, store-notes proposal, secret markers, report from writes', () => {
    const s = skills['ctxr-session-capture'];
    expect(s).toContain('Anti-triggers');
    expect(s).toContain('### Store notes');
    expect(s).toContain('Approve by ID');
    expect(s).toContain('⚠ suspected-secret:');
    expect(s).toContain('## Report from actual writes');
    expect(s).not.toMatch(/world.facts|user.facts|identity/i);
  });

  it('session-capture-command: the Apply step drives the command and covers store notes only', () => {
    const s = skills['ctxr-session-capture'];
    expect(s).toContain('`ctxr session capture --proposal <file>`');
    expect(s).toContain('notes:');
    expect(s).not.toMatch(/world.facts|user.facts|identity/i);
  });

  it('derived artifacts: check before build, count read-back, the fence rule, derived files out of content commits, verify the remote', () => {
    const s = skills['ctxr-derived-artifacts'];
    expect(s).toContain('Check BEFORE you build');
    expect(s).toContain('`ctxr catalog check`');
    expect(s).toContain('read the result back');
    expect(s).toContain('never hand-edit inside a `contexture:<region>` fence');
    expect(s).toContain('OUTSIDE a fence');
    expect(s).toContain('AFTER the content lands');
    expect(s).toContain('`git show origin/trunk:<path> | grep -c <marker>`');
  });

  it('organize audit: move-don\'t-tag, visibility unchanged on retirement, tracked renames, broken-link classes, no stub notes', () => {
    const s = skills['ctxr-organize-audit'];
    expect(s).toContain("## Retiring: move, don't tag");
    expect(s).toContain('visibility field travels unchanged');
    expect(s).toContain('`git status --short` showing `R`');
    expect(s).toContain('## Broken links have classes');
    expect(s).toContain('Never fabricate stub notes');
  });

  it('ingest orchestration: read the cluster first, the decision table, hub and bridge checks via graph query, the thesis-change rule', () => {
    const s = skills['ctxr-ingest-orchestration'];
    expect(s).toContain('read the existing cluster BEFORE writing anything');
    expect(s).toContain('| adds a genuinely new concept | create a new note |');
    expect(s).toContain('Hub check');
    expect(s).toContain('Bridge check');
    expect(s).toContain('`ctxr graph query hubs`');
    expect(s).toContain('Thesis-change rule');
  });

  it('store-primitives-from-migration-audit: owned skills call the new verbs instead of a manual equivalent', () => {
    const s = skills;
    expect(s['ctxr-ingest-orchestration']).toContain('`drift`');
    expect(s['ctxr-ingest-orchestration']).toContain('`ctxr source stamp <path> --id <id>`');
    expect(s['ctxr-ingest-orchestration']).toContain('`ctxr source add-alt <path> --id <new-id>`');
    expect(s['ctxr-rollup']).toContain('`ctxr rollup stale`');
    expect(s['ctxr-organize-audit']).toContain('`ctxr rollup stale`');
    expect(s['ctxr-organize-audit']).toContain('`ctxr check <path> --scan`');
    expect(s['ctxr-organize-audit']).toContain('disclosure.leak_markers');
    expect(s['ctxr-derived-artifacts']).toContain('`ctxr entry append <note> --region <name>`');
  });

  it('no skill names a shipped profile or layer, and none names a real visibility value (D3)', () => {
    expect(SHIPPED_NAMES.length).toBeGreaterThan(0);
    for (const [file, content] of Object.entries(skills)) {
      for (const name of SHIPPED_NAMES) {
        expect(content, `${file} names shipped layer/profile "${name}"`).not.toMatch(new RegExp(`\\b${name}\\b`));
      }
      for (const word of TIER_WORDS) {
        expect(content, `${file} uses "${word}" as a visibility value`).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      }
      // `--as` only ever takes the placeholder
      for (const m of content.matchAll(/--as (<[^>]+>|[\w-]+)/g)) expect(m[1], `${file}: --as ${m[1]}`).toBe('<context>');
      // and the store's own default context is described, never spelled out
      expect(content).not.toContain('ctx-default');
    }
  });

  it('every skill names ctxr, never the project name, as the executable', () => {
    for (const [file, content] of Object.entries(skills)) {
      expect(content, file).not.toMatch(/`contexture [a-z]/);
    }
  });
});

describe('owned-skills-expansion: the termination test follows the configured taxonomy (task 2.2)', () => {
  it('classifies layers by description, never by name', () => {
    const config = makeConfig();
    expect(terminatingLayers(config).map((l) => l.name)).toEqual(['Alpha']);
    expect(retiredLayers(config).map((l) => l.name)).toEqual(['Gamma']);
  });

  it('a taxonomy with a terminating layer renders the termination test naming that layer', () => {
    const s = rendered()['ctxr-placement'];
    expect(s).toContain('Termination test for **Alpha**: does this have a finish line?');
    expect(s).toContain('**Gamma** is where the other layers\' finished or dropped items go');
    expect(s).not.toContain('declares no top-level layers');
  });

  it('a zero-layer taxonomy renders no layer decision and no termination test', () => {
    const s = rendered(makeConfig({ taxonomy: { profile: 'custom', layers: [] } }))['ctxr-placement'];
    expect(s).toContain('This store declares no top-level layers');
    expect(s).not.toContain('Termination test');
    expect(s).not.toContain('finished or dropped items');
  });

  it('a layered taxonomy whose descriptions imply no end state renders neither test', () => {
    const s = rendered(
      makeConfig({
        taxonomy: {
          profile: 'custom',
          layers: [
            { name: 'Lessons', path: 'lessons', description: 'Learning-oriented lessons.' },
            { name: 'Guides', path: 'guides', description: 'Goal-oriented directions.' },
          ],
        },
      }),
    )['ctxr-placement'];
    expect(s).toContain('## 1. Which layer?');
    expect(s).not.toContain('Termination test');
    expect(s).not.toContain('finished or dropped items');
  });
});

describe('syncShippedSkills', () => {
  it('writes every ctxr-owned skill as <slug>/SKILL.md with name/description frontmatter and the managed header', async () => {
    const tmp = await makeTmpDir();
    try {
      const written = await syncShippedSkills(tmp.root, makeConfig());
      expect(written.sort()).toEqual(procedurePaths(makeConfig()).sort());
      expect(written).toHaveLength(11);
      const placement = await readFile(path.join(tmp.root, 'procedures/ctxr-placement/SKILL.md'), 'utf8');
      expect(placement).toContain('name: ctxr-placement');
      expect(placement).toContain('description:');
      expect(placement).toContain(MANAGED_SKILL_HEADER);
    } finally {
      await tmp.cleanup();
    }
  });

  it('is byte-stable: a second sync writes nothing', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncShippedSkills(tmp.root, makeConfig());
      expect(await syncShippedSkills(tmp.root, makeConfig())).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('re-renders when the configuration a skill depends on changes', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncShippedSkills(tmp.root, makeConfig());
      const changed = await syncShippedSkills(tmp.root, makeConfig({ git: { default_branch: 'main' } }));
      expect(changed.sort()).toEqual(
        [
          'procedures/ctxr-session-lifecycle/SKILL.md',
          'procedures/ctxr-submit/SKILL.md',
          'procedures/ctxr-land/SKILL.md',
          'procedures/ctxr-derived-artifacts/SKILL.md',
        ].sort(),
      );
    } finally {
      await tmp.cleanup();
    }
  });

  it('OVERWRITES a drifted ctxr-owned copy (they are owned by contexture, refreshed by update)', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncShippedSkills(tmp.root, makeConfig());
      const skillPath = path.join(tmp.root, 'procedures/ctxr-placement/SKILL.md');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(skillPath, 'hand-edited\n');

      const written = await syncShippedSkills(tmp.root, makeConfig());
      expect(written).toEqual(['procedures/ctxr-placement/SKILL.md']);
      expect(await readFile(skillPath, 'utf8')).not.toBe('hand-edited\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('never touches an operator-authored skill alongside', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'procedures/my-skill'), { recursive: true });
      await writeFile(path.join(tmp.root, 'procedures/my-skill/SKILL.md'), '---\nname: my-skill\n---\nmine\n');

      await syncShippedSkills(tmp.root, makeConfig());
      expect(await readFile(path.join(tmp.root, 'procedures/my-skill/SKILL.md'), 'utf8')).toBe('---\nname: my-skill\n---\nmine\n');
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('syncShippedSkills removes managed copies the installed version no longer ships', () => {
  it('removes a stale contexture-owned directory (managed header) but never an operator skill', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      const { existsSync } = await import('node:fs');
      await mkdir(path.join(tmp.root, 'procedures/ctxr-old-slug'), { recursive: true });
      await writeFile(
        path.join(tmp.root, 'procedures/ctxr-old-slug/SKILL.md'),
        `---\nname: ctxr-old-slug\n---\n\n${MANAGED_SKILL_HEADER}\n\n# Old\n`,
      );
      await mkdir(path.join(tmp.root, 'procedures/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, 'procedures/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      const changed = await syncShippedSkills(tmp.root, makeConfig());
      expect(changed).toContain('procedures/ctxr-old-slug/SKILL.md');
      expect(existsSync(path.join(tmp.root, 'procedures/ctxr-old-slug'))).toBe(false);
      expect(existsSync(path.join(tmp.root, 'procedures/mine/SKILL.md'))).toBe(true);
    } finally {
      await tmp.cleanup();
    }
  });
});

describe('graph-context-document: skills read the vocabulary and the graph document from configuration', () => {
  it('connection finding and ingest orchestration name the graph document path', () => {
    const skills = rendered();
    expect(skills['ctxr-connection-finding']).toContain(GRAPH_DOCUMENT_RELATIVE_PATH);
    expect(skills['ctxr-ingest-orchestration']).toContain(GRAPH_DOCUMENT_RELATIVE_PATH);
  });

  it('the proposal skill groups by the configured vocabulary and names no other relation', () => {
    const config = makeConfig();
    config.retrieval = { ...config.retrieval, relations: ['supports', 'contradicts'] };
    const s = rendered(config)['ctxr-connection-proposal'];
    expect(s).toContain('**supports**, **contradicts**');
    expect(s).not.toContain('single **Related** group');
  });

  it('an empty vocabulary yields one group and no relation name anywhere in the owned skills', () => {
    const skills = rendered();
    expect(skills['ctxr-connection-proposal']).toContain('single **Related** group');
    for (const [file, content] of Object.entries(skills)) {
      for (const word of ['upstream', 'downstream', 'opposing']) {
        expect(content, `${file} hardcodes relation "${word}"`).not.toMatch(new RegExp(`\\b${word}\\b`, 'i'));
      }
    }
  });
});
