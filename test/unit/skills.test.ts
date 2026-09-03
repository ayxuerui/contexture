import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VENDORED_SKILLS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  MANAGED_SKILL_HEADER,
  skillPaths,
  SKILLS,
  renderSkills,
  retiredLayers,
  syncShippedSkills,
  terminatingLayers,
} from '../../src/core/skills.js';
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
    derived: { paths: [] },
    retrieval: { exclude_paths: ['skills/'], relations: [], graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] } },
    git: { default_branch: 'trunk' },
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

function rendered(config = makeConfig()): Record<string, string> {
  return Object.fromEntries(renderSkills(config).map((p) => [p.file, p.content]));
}

const SHIPPED_NAMES = [...new Set(SHIPPED_PROFILES.flatMap((p) => [p.name, ...p.layers.map((l) => l.name)]))];

/** Words a real deployment uses as visibility values; a skill may only ever say `<context>` / `<value>`. */
const TIER_WORDS = ['personal', 'private', 'public', 'shared', 'internal', 'team', 'confidential'];

describe('SKILLS', () => {
  it('names the thirteen owned skills, in index order', () => {
    expect(SKILLS.map((p) => p.file)).toEqual([
      'ctxr-ingest-orchestration',
      'ctxr-placement',
      'ctxr-connection-finding',
      'ctxr-connection-proposal',
      'ctxr-rollup',
      'ctxr-mission',
      'ctxr-session-lifecycle',
      'ctxr-submit',
      'ctxr-land',
      'ctxr-session-capture',
      'ctxr-derived-artifacts',
      'ctxr-organize-audit',
      'ctxr-publish',
    ]);
  });

  it('every rendered skill carries frontmatter, the managed header, and its H1', () => {
    for (const p of renderSkills(makeConfig())) {
      expect(p.content.startsWith(`---\nname: ${p.file}\ndescription: ${p.description}\n---\n`)).toBe(true);
      expect(p.content).toContain(MANAGED_SKILL_HEADER);
      expect(p.content).toContain(`\n# ${p.name}\n`);
      expect(p.description).not.toMatch(/: /); // a plain YAML scalar — no "key: value" inside it
    }
  });

  /**
   * vendored-craft-skills spec: the content guards below (no shipped-profile
   * or tier-word leakage, `ctxr` never `contexture`) apply to skills
   * contexture AUTHORS — every one of them iterates `renderSkills(config)` /
   * `SKILLS`. Vendored third-party content is redistributed as-is and was
   * never written against those rules, so it must never flow through
   * `renderSkills` — this is what makes the exemption structural rather
   * than a guard someone has to remember to skip. Do not "fix" a future
   * guard by widening it to also scan `templates/vendor/**`.
   */
  it('vendored skills are never part of SKILLS or renderSkills output — the guards below cannot see them', () => {
    expect(DEFAULT_VENDORED_SKILLS.length).toBeGreaterThan(0); // anti-vacuity
    const vendored = [...DEFAULT_VENDORED_SKILLS] as string[];
    for (const name of vendored) expect(SKILLS.some((s) => s.file === name)).toBe(false);
    for (const p of renderSkills(makeConfig())) {
      expect(vendored).not.toContain(p.file);
      expect(p.content).not.toContain('templates/vendor');
    }
  });
});

describe('owned-skills-expansion: each skill carries its load-bearing rule (task 2.1)', () => {
  const skills = rendered();

  it('placement: secrets never enter the store, sub-item promotion, perishable routing, sibling style', () => {
    const s = skills['ctxr-placement'];
    expect(s).toContain('Credentials, full account numbers, and secrets never enter the store');
    expect(s).toContain('Promote to its own top-level location');
    expect(s).toContain('fenced `contexture:<region>` block you OVERWRITE');
    expect(s).toContain('Read one or two sibling notes');
  });

  it('session capture: separates a rule from a fact, defaults to no, proposes removals, and never routes a convention through the notes command', () => {
    const s = skills['ctxr-session-capture'];
    expect(s).toContain('a note records that');
    expect(s).toContain('The default answer is NO');
    expect(s).toContain('Propose REMOVALS');
    expect(s).toContain('not already in the shipped baseline');
    // The bar's four clauses, and the write path: conventions are a direct
    // edit, because `ctxr session capture` writes notes and stamps visibility.
    expect(s).toContain('never the YAML above');
    expect(s).toContain('same commit');
    // The store's configured guidance path, not a hardcoded one.
    expect(s).toContain('guidance/house-conventions.md');
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

  it('mission: kept current from recent work and the taxonomy layers, status/purpose/next-action, dormant reasons, sunset/debt as their own sections, and writes via ctxr rollup write (generalize-identity-migration-residue)', () => {
    const s = skills['ctxr-mission'];
    expect(s).toContain('AGENTS.md');
    expect(s).toContain('If no mission document is configured for');
    expect(s).toContain('every store location the taxonomy');
    expect(s).toContain('status, its purpose, and its next useful action');
    expect(s).toContain('state plainly why it is not active right now');
    expect(s).toContain('Carry sunset candidates');
    expect(s).toContain('operational');
    expect(s).toContain('debt');
    expect(s).toContain('`ctxr rollup stale`');
    expect(s).toContain('`ctxr rollup write <mission_path> --content-file <file>`');
    expect(s).toContain('## Report');
  });

  it('mission is present in renderSkills() output and skillPaths()', () => {
    expect(renderSkills(makeConfig()).map((p) => p.file)).toContain('ctxr-mission');
    expect(skillPaths(makeConfig())).toContain('skills/ctxr-mission/SKILL.md');
  });

  it('session lifecycle: start, re-scan discipline, conflict playbook, sequencing, reclaiming — and none of ctxr-submit/ctxr-land\'s own steps (session-keeps-only-what-git-cannot-do)', () => {
    const s = skills['ctxr-session-lifecycle'];
    expect(s).toContain('## Start');
    expect(s).toContain('## Re-scan before any plan');
    expect(s).toContain('## Conflict playbook');
    expect(s).toContain('## Multi-PR sequencing');
    expect(s).toContain('## Reclaiming');
    expect(s).toContain('`git log --oneline origin/trunk..HEAD`'); // the CONFIGURED default branch, not a hardcoded one
    expect(s).toContain('git rebase origin/trunk`');
    expect(s).not.toMatch(/\bgit commit\b/); // committing is ctxr-submit's step, not this skill's
    expect(s).not.toMatch(/\bgit push\b(?! --force-with-lease)/); // only the conflict playbook's force-with-lease push
    // this skill references the two seam verbs but does not repeat their steps
    expect(s).toContain('`ctxr-submit`');
    expect(s).toContain('`ctxr-land`');
    expect(s).not.toContain('ctxr session submit');
    expect(s).not.toContain('ctxr session land');
  });

  it('session lifecycle: reclaiming is git-driven and scoped by session list, with no config branch left to diverge (session-keeps-only-what-git-cannot-do)', () => {
    const s = skills['ctxr-session-lifecycle'];
    expect(s).toContain('`ctxr session list`'); // the safe read that scopes the unsafe write
    expect(s).toContain('`git worktree remove <path>`'); // merged-and-clean, unforced
    expect(s).toContain('`git worktree remove --force <path>`'); // deliberate discard, forced and named as destructive
    expect(s).toContain('destroys any uncommitted or');
    // Merged-ness comes from the forge, never git ancestry: a squash merge (GitHub's default) leaves the
    // squashed commit off the branch tip, so `git branch -d` refuses every landed branch forever. Guidance
    // that reads that refusal as "unmerged work" strands every session a squash-merging store ever landed.
    expect(s).toContain('gh pr view <branch> --json state');
    expect(s).toMatch(/squash/i);
    expect(s).toContain('`git branch -D`'); // the correct finish once the forge confirmed the merge
    // no config key exists anymore to render a second, possibly-inconsistent variant of this skill
    expect(s).not.toContain('workspaces_external');
    expect(s).not.toContain('provided externally');
    expect(s).not.toMatch(/MUST NOT/);
    // Start (which creates a worktree) and Reclaiming (which removes one) coexist without contradiction —
    // the defect this replaces was Start unconditionally instructing creation while Reclaiming, under one
    // config, forbade it in the same document. There is now exactly one rendering, so both always agree.
    expect(s).toContain('creates a worktree on a fresh branch');
  });

  it('submit: re-scans, runs the capture procedure exactly once, stages named paths, validates, and ends in git push + gh pr create with no confirmation between (submit-is-its-own-consent)', () => {
    const s = skills['ctxr-submit'];
    expect(s).toContain('Re-scan (mandatory');
    expect((s?.match(/ctxr-session-capture/g) ?? []).length).toBe(1); // invoked once, not described twice
    expect(s).toContain('never `git add -A`');
    expect(s).toContain('`ctxr doctor`'); // store-scope validation, the same check submit used to run internally
    expect(s).toMatch(/\bgit commit\b/); // now an explicit step — nothing else commits on its behalf
    expect(s).toContain('`git branch -m "<name>"`'); // renames a generated branch before it reaches the forge
    expect(s).toMatch(/\bgit push\b/);
    expect(s).toContain('`gh pr create'); // run directly — invoking submit is itself the consent for it
    // submit-is-its-own-consent: no confirmation stands between the branch rename and the push. The
    // gate on this path is `ctxr doctor` (step 5), which submit may not proceed past; land keeps its
    // own merge confirmation, which is why the sentence is asserted absent HERE and present there.
    expect(s).not.toMatch(/plan consent\s+is not fire consent/);
    const body = s ?? ''; // an absent skill yields -1 for every index below, which fails these on its own
    expect(body.indexOf('`git branch -m "<name>"`')).toBeLessThan(body.indexOf('git push'));
    expect(body.indexOf('git push')).toBeLessThan(body.indexOf('`gh pr create'));
    expect(s).not.toContain('ctxr session submit'); // no such command exists anymore
    expect(s).toContain('Verify before any retry');
  });

  it('land: reads pull-request state before any side effect, merges with gh, confirms after, syncs by fast-forward, and routes conflicts to the lifecycle skill (session-keeps-only-what-git-cannot-do)', () => {
    const s = skills['ctxr-land'];
    expect(s).not.toContain('ctxr session land'); // no such command exists anymore
    expect(s).toContain('ctxr-session-lifecycle');
    expect(s).toContain('conflict playbook');
    // the target is named explicitly, never inferred from wherever the agent happens to stand
    expect(s).toContain('a branch name or a pull-request number');
    expect(s).toMatch(/rather than relying on whichever\s+checkout you happen to be standing in/);
    expect(s).toContain('`gh pr view'); // state read before any side effect
    expect(s).toMatch(/\bMERGEABLE\b/);
    expect(s).toMatch(/\bCONFLICTING\b/);
    expect(s).toMatch(/\bUNKNOWN\b/);
    expect(s).toContain('`gh pr merge'); // step 5's actual mechanism — inverted from the old CLI-only ban
    expect(s).toContain('re-read state'); // never trusts the merge command's exit code alone
    expect(s).toMatch(/\bgit merge --ff-only\b/); // the canonical-clone sync
    expect(s).not.toMatch(/Never merge by hand/i); // design D6: the old ban is gone, gh pr merge is now the step
    expect(s).toMatch(/from outside the\s+worktree being removed/);
    // Reclaiming is the default action, not an optional extra: `ctxr session reap` no longer exists to
    // sweep up a worktree left behind, so the skill names no unowned "leave it to someone else" opt-out.
    expect(s).toContain('the default action, not an optional extra');
    expect(s).toMatch(/nothing sweeps up afterward/);
    expect(s).not.toMatch(/whoever owns the worktree/);
    expect(s).not.toMatch(/if you want to now/);
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

  it('organize audit: move-don\'t-tag, frontmatter unchanged on retirement, tracked renames, broken-link classes, no stub notes', () => {
    const s = skills['ctxr-organize-audit'];
    expect(s).toContain("## Retiring: move, don't tag");
    expect(s).toContain("note's frontmatter travels unchanged");
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

  it('publish: judge what belongs on the page, identity fixed once, excluded from retrieval, both craft axes delegated not invented', () => {
    const s = skills['ctxr-publish'];
    expect(s).toContain('Decide what belongs on the page');
    expect(s).toContain('The store does not decide this for you');
    expect(s).toContain('must\nnot carry material written about that party');
    expect(s).toContain('leave it out and name it to the operator');
    expect(s).toContain('`ctxr publish new <slug>`');
    expect(s).toContain('refuses to overwrite an existing folder');
    // Wrap-tolerant on purpose: these pin the rule, not the column the template
    // happens to wrap at. Re-flowing a paragraph is not a behavior change and
    // must not fail here, which the previous newline-spanning literals did.
    expect(s).toMatch(/Contexture ships no\s+renderer of its own and no house voice/);
    expect(s).toContain('**The form and its visual language.**');
    expect(s).toMatch(/`frontend-design` skill this store carries by\s+default/);
    expect(s).toContain('**The prose that explains the subject.**');
    expect(s).toMatch(/`eli5` skill this\s+store carries by default/);
    // The two senses of "audience" stay apart: step 3's gate answers who may
    // see it, step 5's reader answers how it must be told. Conflating them is
    // how "write it plainer" gets heard as "disclose it wider".
    expect(s).toMatch(/Both skills say "audience", and neither means step 3's/);
    expect(s).toContain('never a value you pass to `--audience`');
    expect(s).toContain('excluded from retrieval by default');
    expect(s).toContain('`ctxr publish check <path>`');
  });

  it('store-primitives-from-migration-audit: owned skills call the new verbs instead of a manual equivalent', () => {
    const s = skills;
    expect(s['ctxr-ingest-orchestration']).toContain('`drift`');
    expect(s['ctxr-ingest-orchestration']).toContain('`ctxr source stamp <path> --id <id>`');
    expect(s['ctxr-ingest-orchestration']).toContain('`ctxr source add-alt <path> --id <new-id>`');
    expect(s['ctxr-rollup']).toContain('`ctxr rollup stale`');
    expect(s['ctxr-organize-audit']).toContain('`ctxr rollup stale`');
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

  it('no template placeholder survives rendering', () => {
    // A seed that forgets its .replaceAll ships the literal __TOKEN__ to every
    // store, in a file agents read as instructions. Guards every substitution,
    // not just the ones that exist today.
    for (const [file, content] of Object.entries(skills)) {
      const leaked = content.match(/__[A-Z][A-Z0-9_]*__/g);
      expect(leaked, `${file} leaked ${leaked?.join(', ')}`).toBeNull();
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
      expect(written.sort()).toEqual(skillPaths(makeConfig()).sort());
      expect(written).toHaveLength(13);
      const placement = await readFile(path.join(tmp.root, 'skills/ctxr-placement/SKILL.md'), 'utf8');
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
          'skills/ctxr-session-lifecycle/SKILL.md',
          'skills/ctxr-submit/SKILL.md',
          'skills/ctxr-land/SKILL.md',
          'skills/ctxr-derived-artifacts/SKILL.md',
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
      const skillPath = path.join(tmp.root, 'skills/ctxr-placement/SKILL.md');
      const { writeFile } = await import('node:fs/promises');
      await writeFile(skillPath, 'hand-edited\n');

      const written = await syncShippedSkills(tmp.root, makeConfig());
      expect(written).toEqual(['skills/ctxr-placement/SKILL.md']);
      expect(await readFile(skillPath, 'utf8')).not.toBe('hand-edited\n');
    } finally {
      await tmp.cleanup();
    }
  });

  it('never touches an operator-authored skill alongside', async () => {
    const tmp = await makeTmpDir();
    try {
      const { mkdir, writeFile } = await import('node:fs/promises');
      await mkdir(path.join(tmp.root, 'skills/my-skill'), { recursive: true });
      await writeFile(path.join(tmp.root, 'skills/my-skill/SKILL.md'), '---\nname: my-skill\n---\nmine\n');

      await syncShippedSkills(tmp.root, makeConfig());
      expect(await readFile(path.join(tmp.root, 'skills/my-skill/SKILL.md'), 'utf8')).toBe('---\nname: my-skill\n---\nmine\n');
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
      await mkdir(path.join(tmp.root, 'skills/ctxr-old-slug'), { recursive: true });
      await writeFile(
        path.join(tmp.root, 'skills/ctxr-old-slug/SKILL.md'),
        `---\nname: ctxr-old-slug\n---\n\n${MANAGED_SKILL_HEADER}\n\n# Old\n`,
      );
      await mkdir(path.join(tmp.root, 'skills/mine'), { recursive: true });
      await writeFile(path.join(tmp.root, 'skills/mine/SKILL.md'), '---\nname: mine\n---\nmine\n');

      const changed = await syncShippedSkills(tmp.root, makeConfig());
      expect(changed).toContain('skills/ctxr-old-slug/SKILL.md');
      expect(existsSync(path.join(tmp.root, 'skills/ctxr-old-slug'))).toBe(false);
      expect(existsSync(path.join(tmp.root, 'skills/mine/SKILL.md'))).toBe(true);
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
