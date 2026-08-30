import { mkdir, readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig, TaxonomyLayerConfig } from '../config/schema.js';
import { scanDocsDir, SKILL_FILE_NAME, type ScannedDoc } from './conventions.js';
import { writeFileAtomic } from './fs/atomic.js';
import { GRAPH_DOCUMENT_RELATIVE_PATH } from './graph/persist.js';
import { identityFilePath } from './identity.js';

/**
 * harness-portability spec (task 8.6, revised by entry-doc-generation D5,
 * expanded by owned-skills-expansion): reusable store procedures ship as
 * contexture-OWNED skills. The canonical content is this module (versioned
 * with the package); a store carries a full copy at
 * `<procedures_path>/ctxr-<slug>/SKILL.md` — written by `ctxr init`,
 * refreshed by `ctxr update`, never hand-edited. The default location is
 * the directory harnesses with skill auto-discovery read, so there is no
 * wrapper and no extra hop; any other harness reaches the same file by
 * path from AGENTS.md. Operator-authored skills live alongside, untouched
 * by sync.
 *
 * Each skill is a decision procedure against commands that exist, not a
 * bare command sequence (owned-skills-expansion D2/D3): every rule is
 * stated against the store's CONFIGURED taxonomy, contexts, and relation
 * vocabulary — a shipped profile's layer names and any real context value
 * never appear in this file — and every "verify" step names the command
 * that verifies it. The one config-derived skill (placement) is rendered
 * per store, which is why a seed's body is a function of the config.
 */
export interface Procedure {
  /** Skill directory slug under config.harness.procedures_path (file is `<slug>/SKILL.md`). */
  file: string;
  /** The human title (the H1 in the skill body). */
  name: string;
  /** One line for skill-discovery metadata and the AGENTS.md index. */
  description: string;
  content: string;
}

interface ProcedureSeed {
  file: string;
  name: string;
  description: string;
  /** The markdown body below the H1, one entry per line, rendered against the store's config. */
  body: (config: StoreConfig) => string[];
}

export const MANAGED_SKILL_HEADER =
  '<!-- Owned by contexture — written by `ctxr init`, refreshed by `ctxr update`. Do not edit; add your own skills alongside. -->';

/**
 * owned-skills-expansion D3: the placement procedure's termination test is
 * emitted only for a layer whose configured description implies an end
 * state; a layer whose description describes retired items is the
 * destination `ctxr archive` moves things to. Both are read off the
 * description text, never off a layer's name.
 */
const END_STATE_PATTERN = /\b(end[- ]state|finish(?:ed|es|ing)?|finish line|deadline|due date)\b/i;
const RETIRED_PATTERN = /\b(completed|abandoned|inactive|archived|retired|dormant)\b/i;

export function terminatingLayers(config: StoreConfig): TaxonomyLayerConfig[] {
  return config.taxonomy.layers.filter((layer) => END_STATE_PATTERN.test(layer.description) && !RETIRED_PATTERN.test(layer.description));
}

export function retiredLayers(config: StoreConfig): TaxonomyLayerConfig[] {
  return config.taxonomy.layers.filter((layer) => RETIRED_PATTERN.test(layer.description));
}

function skillDocument(seed: ProcedureSeed, config: StoreConfig): string {
  const lines = [
    '---',
    `name: ${seed.file}`,
    `description: ${seed.description}`,
    '---',
    '',
    MANAGED_SKILL_HEADER,
    '',
    `# ${seed.name}`,
    '',
    ...seed.body(config),
  ];
  return `${lines.join('\n')}\n`;
}

function joinNames(layers: TaxonomyLayerConfig[]): string {
  return layers.map((layer) => `**${layer.name}**`).join(' / ');
}

function placementLayerStep(config: StoreConfig): string[] {
  const { layers } = config.taxonomy;
  if (layers.length === 0) {
    return [
      '## 1. Which layer?',
      '',
      'This store declares no top-level layers, so there is no layer decision: place the note next to the notes',
      'it will link to most (`ctxr graph query neighbors <path>` on the closest existing note shows that cluster)',
      'and let wikilinks carry the structure.',
    ];
  }
  const lines = [
    '## 1. Which layer?',
    '',
    'Read AGENTS.md\'s "Placing a new note" section — it lists this store\'s configured layers with their',
    'descriptions and their visibility defaults. Choose by what the content fundamentally IS, not by surface',
    'keywords; a label on a location says nothing about what is actually kept there.',
  ];
  const terminating = terminatingLayers(config);
  if (terminating.length > 0) {
    lines.push(
      '',
      `- Termination test for ${joinNames(terminating)}: does this have a finish line? If it never closes, it does`,
      '  not belong there. An item in that layer that can never close is a smell — it either clutters the layer',
      '  as open-forever or gets retired prematurely. Never create one on purpose; an ongoing responsibility',
      '  with a standard to maintain belongs in a layer whose description says so.',
    );
  }
  const retired = retiredLayers(config);
  if (retired.length > 0) {
    lines.push(
      '',
      `- ${joinNames(retired)} is where the other layers' finished or dropped items go — never a first placement.`,
      '  Retire a note with `ctxr archive <path>` (a tracked move; frontmatter untouched).',
    );
  }
  lines.push('', 'If no layer fits, use the catch-all location that section names and revisit the placement later.');
  return lines;
}

const PLACEMENT: ProcedureSeed = {
  file: 'ctxr-placement',
  name: 'Placement',
  description: 'Choose the right taxonomy layer, location, and visibility for a new or relocated note in this contexture store, with the reasoning.',
  body: (config) => [
    'Decide where a note lives BEFORE writing it, and say why: the caller wants the reasoning (which layer, why',
    'this location over its sibling, which visibility, what would promote it) so they can push back — not a',
    'folder name. Answer the questions in order; stop early only when the content clearly resolves.',
    '',
    ...placementLayerStep(config),
    '',
    '## 2. Which location within the layer?',
    '',
    '- Match on what the content IS. When two sibling locations both seem to fit, name the distinction between',
    '  them (abstract vs concrete; outward-facing vs inward-facing; who-we-are vs how-it-runs) and pick by',
    '  altitude and audience, not by keyword.',
    '- Read one or two sibling notes in the chosen location and match their shape — frontmatter keys, heading',
    '  style, bullets vs prose — before writing.',
    '',
    '## 3. Sub-item under an existing location, or a new top-level one?',
    '',
    'Default to a sub-item until it earns promotion. A near-empty top-level location is its own kind of',
    'clutter — worse than a slightly crowded existing one. Starting small and promoting later is cheap;',
    'starting big and hollow is not. Make the promotion trigger a rule, not a vibe, and write it INTO the',
    'note: "Promote to its own top-level location the moment this holds 3+ distinct notes or topics."',
    '',
    '## 4. Which visibility?',
    '',
    'Visibility is a placement input, not an afterthought, because the location sets the visibility default',
    '(`ctxr note resolve <path>` shows the resolved value and where it came from):',
    '',
    '- Lean on the location\'s default; set the visibility field in frontmatter only when you must.',
    '- Content that bridges two contexts goes to the more restrictive one — this store fails closed to its',
    '  default context (AGENTS.md names it) whenever nothing more specific applies.',
    '- Visibility can override location: when the visibility the content requires differs from every location',
    '  that fits topically, the topical fit loses.',
    '- Credentials, full account numbers, and secrets never enter the store — last-4 only.',
    '',
    '## The collision test — "should A and B be one location?"',
    '',
    'Before merging two locations, compare their visibility defaults (the placement section shows them). If',
    'they differ, do NOT merge: a merged location has no safe default, every note in it needs a manual',
    'override, and the day one is forgotten the fail-closed protection is gone — a structural guard traded for',
    'human vigilance. If the two genuinely form one continuum with a fuzzy seam, place the boundary',
    'deliberately and give the overlap ONE bridge note with an explicit visibility value, not a merged drawer.',
    'A merge request often mis-detects that one side is itself mis-placed; the clean answer can be the',
    'opposite of merging — split the mis-placed piece out and re-home it. Say so when you see it.',
    '',
    '## Perishable vs durable',
    '',
    'One capture often mixes a durable fact with perishable specifics. The durable part (the reusable',
    'structure, mechanic, or trap) goes into the permanent note. The perishable part (this period\'s values,',
    'links, boilerplate) goes into a fenced `contexture:<region>` block you OVERWRITE on each refresh, never',
    'an accumulating pile of dead entries. Do not ingest a perishable item as source material — that',
    'manufactures an artifact for the graveyard; capture the durable slice by hand instead.',
    '',
    '## Wire it in',
    '',
    'Add a one-line wikilink from the relevant hub note so the new note is not an orphan; `ctxr lint` flags',
    'orphans and notes without a catalog entry.',
    '',
    '## Relocating an existing note',
    '',
    '`ctxr archive <path>` to retire it; a plain tracked `git mv` for an ordinary re-placement. Either way the',
    'frontmatter — including the visibility field — is left untouched.',
    '',
    '## Verify',
    '',
    '`ctxr note resolve <path>` for the visibility; `ctxr lint` for orphans and catalog gaps; `ctxr doctor` for',
    'anything that blocks a submit.',
  ],
};

const INGEST_ORCHESTRATION: ProcedureSeed = {
  file: 'ctxr-ingest-orchestration',
  name: 'Ingest orchestration',
  description: 'Capture raw material into the inbox, run the dedupe check, read the existing cluster, decide new/update/merge/restructure, and ingest with source identity via the contexture CLI.',
  body: () => [
    'Ingest is synthesis, not filing. The question is what the store should know after this source, not where',
    'to put the file — "create a new note" is one option among several, never the default.',
    '',
    '1. Capture: write a plain markdown file directly into the inbox (see AGENTS.md\'s capture section) — no',
    '   provenance frontmatter; contexture assigns it at ingest.',
    '2. Check: run `ctxr source check <path> --source-id <id>` and read the verdict — `new`, `already_ingested`,',
    '   `alternate_source_match`, or `multiple_matches`. On `multiple_matches`, stop and resolve the ambiguity',
    '   yourself; never guess which existing note it is.',
    '3. Read the source fully. Then read the existing cluster BEFORE writing anything: the catalog section for',
    '   the domain (`ctxr catalog show --section <id>`), every related note in it (all of them, not one or two),',
    '   and the graph (`ctxr graph build`, then read the graph document it writes at',
    `   \`${GRAPH_DOCUMENT_RELATIVE_PATH}\` for hub notes by cluster and cross-cluster bridges; \`ctxr graph query hubs\``,
    '   and `ctxr graph query neighbors <path>` on the closest note for the detail). Ask: what does the',
    '   store already know, and does this source confirm, extend, contradict, or nuance it?',
    '4. Decide — the decision table:',
    '',
    '   | The source… | Action |',
    '   |---|---|',
    '   | adds a genuinely new concept | create a new note |',
    '   | deepens an existing note | update and expand that note |',
    '   | makes two notes redundant | merge them; fix every cross-link |',
    '   | reveals a note is badly structured | recreate it with better structure |',
    '   | belongs as a section, not a page | add a section to the existing note |',
    '   | does several of the above | do all of them |',
    '',
    '   - Hub check: if the cluster\'s hub already covers this, update the hub. If this source could become a',
    '     hub — a note many future notes will reference — create it at hub level, not as a leaf.',
    '   - Bridge check: if the source connects two clusters that have no bridge note, create one or add',
    '     explicit cross-links.',
    '   - Thesis-change rule: when new material contradicts a note, patch its top-level conclusion FIRST, then',
    '     hunt down the now-stale verdict language further down. A corrected body under an uncorrected',
    '     headline is worse than either alone.',
    '   - Source discipline: a field the source does not confirm is "not reported" — never inferred from',
    '     silence in either direction.',
    '5. Write: for a new note, `ctxr ingest <path> --source-type <type> --source-id <id>` (stamps provenance and',
    '   gives it a catalog entry). Updates to existing notes are ordinary edits that preserve prior content',
    '   (a deliberate ingest despite an `alternate_source_match` is the same command).',
    '6. Verify: `ctxr lint` (orphans, broken links, leftover inbox material) and `ctxr catalog check`.',
  ],
};

const CONNECTION_FINDING: ProcedureSeed = {
  file: 'ctxr-connection-finding',
  name: 'Connection finding',
  description: 'Traverse the wikilink graph of the store (neighbors, paths, hubs, orphans) to find what a note already connects to.',
  body: () => [
    'Traversal of links that already exist. To discover links a note SHOULD have, use `ctxr-connection-proposal`;',
    'to synthesize an entity\'s current state from its sources, use `ctxr-rollup`.',
    '',
    '1. Run `ctxr graph build` to refresh the wikilink graph from the store\'s current notes, then read the graph',
    `   document it writes at \`${GRAPH_DOCUMENT_RELATIVE_PATH}\` — hub notes by cluster, cross-cluster bridges,`,
    '   orphans — for the cluster context the point queries below do not summarize.',
    '2. To find what a note connects to or from, run `ctxr graph query neighbors <path>` (add `--depth` for',
    '   further hops, `--direction in|out|both`, `--type <relation>` to follow one configured relation,',
    '   `--as <context>` to see only what that context can see).',
    '3. To find a path between two notes, run `ctxr graph query path <from> <to>`.',
    '4. To find the most-referenced notes, run `ctxr graph query hubs`; to find unlinked ones,',
    '   `ctxr graph query orphans`; `ctxr graph query clusters` and `ctxr graph query bridges` show the',
    '   cluster structure and the notes that span it.',
    '5. Report what the graph says — it enumerates structure and ranks nothing; judgment about which links',
    '   matter is yours.',
  ],
};

/**
 * graph-context-document spec: the proposal skill groups by the CONFIGURED
 * relation vocabulary (the same names `ctxr graph build` types edges from)
 * and falls back to one group — never a relation name of its own.
 */
function relationGroupingStep(relations: readonly string[]): string[] {
  if (relations.length === 0) {
    return [
      '5. This store configures no relation vocabulary (`retrieval.relations` is empty), so present proposals as',
      '   a single **Related** group. Format each item as `[[Note]]` — reason.',
    ];
  }
  return [
    `5. Group proposals by this store's configured relation vocabulary: ${relations.map((r) => `**${r}**`).join(', ')}`,
    '   (`retrieval.relations` — the section headings carrying these names are what `ctxr graph build` types',
    '   edges from, so a link written under the right heading becomes a typed edge on the next build). Format',
    '   each item as `[[Note]]` — reason.',
  ];
}

const CONNECTION_PROPOSAL: ProcedureSeed = {
  file: 'ctxr-connection-proposal',
  name: 'Connection proposal',
  description: 'Discover the links a note should have, read each candidate before proposing, group by the store relation vocabulary, and write only approved links.',
  body: (config) => [
    'Link DISCOVERY — complementing `ctxr-connection-finding`, which traverses links that already exist.',
    '',
    '1. Read the target note in full. If given a name instead of a path, find the file; several candidates →',
    '   ask which one, never pick.',
    '2. Extract its key concepts, entities (people, organizations, products), claims, and tags.',
    '3. Search the store with those terms: content search (grep) for the phrases, the catalog section for the',
    '   domain (`ctxr catalog show --section <id>`), and `ctxr graph query neighbors <path> --depth 2` for',
    '   two-hop candidates the note does not link directly.',
    '4. Read every candidate before proposing it. A keyword match is not a connection; each proposal states in',
    '   one line why the link is meaningful to a reader of the target note.',
    ...relationGroupingStep(config.retrieval.relations),
    '6. Confirm before writing: present the grouped proposals and wait for approval by item. Do not write on',
    '   silence or on plan-level agreement.',
    '7. Write approved links into the matching section of the target note, creating the relation sections the',
    '   sibling notes use when the note lacks them. No other edits to the note in the same pass.',
    '8. Report: notes scanned, proposals per group, links written, and nearby orphans',
    '   (`ctxr graph query orphans`) that would also benefit from linking.',
  ],
};

const ROLLUP: ProcedureSeed = {
  file: 'ctxr-rollup',
  name: 'Rollup',
  description: 'Regenerate the synthesized current-state region of an entity note from every source that references it, with provenance for every fact.',
  body: () => [
    'Regenerate the machine-synthesized current-state region of an entity note (a person, organization,',
    'product, initiative, or topic hub) from every note that references it. Hand-written content outside the',
    'fenced region is never touched.',
    '',
    '1. Resolve, never create. `<entity>` is a path or a note name; several candidates → list them and ask.',
    '   When a location has more than one plausible hub, prefer the shorter-named, undated one. If no entity',
    '   note exists, STOP and say so — creating it is a separate task, not a side effect of a rollup.',
    '2. Refuse non-entities. Dated notes, journal entries, meeting notes, generated files, and store',
    '   infrastructure are INPUTS to rollups, not entities. If the name resolves to one of those, stop and ask',
    '   which entity was meant.',
    '3. Gather: `ctxr rollup gather <entity>` enumerates the candidate sources (notes linking to it). Fewer',
    '   than 3 accepted sources → push back ("only N notes reference this; a rollup would be thin — continue?")',
    '   and do not auto-continue.',
    '4. Read EVERY accepted source, not a sample — the value of a rollup is total recall over the entity\'s',
    '   corpus. Per source note its date (filename, frontmatter, then mtime as a last resort), its kind, and',
    '   what it says about THIS entity specifically. For a long source, grep for the entity first.',
    '5. Synthesize into a file, in this shape — bullets throughout, short clauses; skip any empty subsection',
    '   silently (never "N/A", "none", or "TBD"):',
    '',
    '   ```',
    '   ## Current state',
    '   ### Status            — one fact per line; what it is, what is happening now, headline problem or metric',
    '   ### Recent activity   — `YYYY-MM-DD — what happened [[Source]]`, most recent first',
    '   ### Open threads      — unresolved decisions, blockers, pending actions; each links where it was raised',
    '   ### Key people        — `[[Person]] — role in this entity\'s orbit`; only people present in the corpus',
    '   ### Sources           — every note consulted, sorted; the audit trail',
    '   ```',
    '',
    '   Provenance rules: every fact traceable to a source note — nothing from memory or earlier conversation;',
    '   no editorializing or recommendations; nothing dated later than today; inline `[[wikilinks]]` when one',
    '   claim has one clear source.',
    '6. Write: `ctxr rollup write <entity> --content-file <file>` — an idempotent fenced write (`changed: false`',
    '   and a byte-identical file when the content matches; mismatched markers abort with nothing written).',
    '7. Report: entity path, sources accepted, `changed` or unchanged, and notable findings (e.g. the oldest',
    '   unresolved thread). Anything outside the fence you want to fix is a separate, explicit edit.',
  ],
};

const SUBMIT: ProcedureSeed = {
  file: 'ctxr-submit',
  name: 'Submit',
  description: 'End a working session — re-scan, capture once, stage surgically, gate the external side effect, and open the reviewed pull request.',
  body: (config) => {
    const defaultBranch = config.git.default_branch;
    return [
      'The submit half of the session lifecycle — everything up to and including opening the pull request.',
      '`ctxr-land` is the other half, after review; `ctxr-session-lifecycle` covers what surrounds both (starting',
      'a session, the conflict playbook, sequencing several pull requests) and is not repeated here.',
      '',
      '1. Re-scan (mandatory — never replay a plan from an earlier snapshot): `git fetch origin`,',
      '   `git status --short`, `git diff --stat`, `git diff --cached --stat`,',
      `   \`git ls-files --others --exclude-standard\`, \`git log --oneline origin/${defaultBranch}..HEAD\`. State moves`,
      '   under you while you work; name the delta from the previous scan rather than silently folding new work',
      '   into old buckets.',
      '2. Capture pass: run `ctxr-session-capture` exactly once here — closing a session is itself a capture',
      '   trigger; do not fire it again after submitting.',
      '3. Stage surgically: `git add <paths>`, never `git add -A`; confirm with `git status --short` that the',
      '   staged set matches the intended unit. Derived artifacts under the cache paths never stage.',
      '4. One coherent unit per pull request. If the session produced two disjoint units, say so and ask',
      '   whether to split.',
      '5. Fire gate: `ctxr session submit` commits, pushes, and opens the pull request — an external side',
      '   effect, and plan consent is not fire consent. Present the branch, the title, and what rides it; wait',
      '   for an explicit go before running it.',
      '6. Run: `ctxr session submit --branch "<name>" --title "<title>" --body "<why / what changed /',
      '   verification / follow-ups>"`. Name a real branch with `--branch` — never let a generated name reach',
      '   the forge. It runs the full store validation first; fix a failure, never bypass it. If no forge is',
      '   reachable it still pushes and prints the manual pull-request instructions.',
      '7. Verify before any retry: a transport error can arrive AFTER the push or the pull-request open already',
      '   succeeded. Before retrying anything, `git ls-remote origin <branch>` and the forge\'s pull-request list',
      '   for the branch — never replay a push or a pull-request open blindly.',
      '8. Hand off: report the pull request, then point at `ctxr-land` for after review.',
    ];
  },
};

const LAND: ProcedureSeed = {
  file: 'ctxr-land',
  name: 'Land',
  description: 'Complete a reviewed session — merge its pull request, sync the default branch, and reclaim the worktree — one gated command, never a manual merge.',
  body: (config) => {
    const defaultBranch = config.git.default_branch;
    return [
      'The land half of the session lifecycle, after review. `ctxr-submit` is the other half; `ctxr-session-lifecycle`',
      'covers what surrounds both and is not repeated here.',
      '',
      '1. Resolve the target: the current session branch by default, or name one with `--branch <name>` or',
      `   \`--pr <n>\`. Never run this against \`${defaultBranch}\` itself.`,
      '2. Run `ctxr session land` (add `--yes` only when you already have explicit approval from elsewhere in',
      '   this conversation; otherwise let it prompt). It reads the pull request\'s state, gates the merge behind',
      '   an explicit confirmation, merges with `--merge-method` (default squash), confirms the forge reports',
      '   merged, and fast-forwards the default branch in the checkout it runs from when that checkout is on',
      `   \`${defaultBranch}\` — a checkout that cannot fast-forward is reported, never forced.`,
      '3. Conflicting or unknown mergeability stops the command; follow `ctxr-session-lifecycle`\'s conflict',
      '   playbook, then retry — a retry re-reads state and performs only what remains.',
      '4. Add `--reap` to remove the session worktree in the same run, once it is clean and merged; otherwise',
      '   run `ctxr session reap` afterward, or leave cleanup to whoever owns the worktree.',
      '5. Report exactly what the command reported — merged or not, synced or not (with why not), reaped or not',
      '   (with why not). Never claim a merge or a cleanup the command itself did not confirm.',
      '',
      'Never merge by hand (a raw forge-CLI merge, the forge\'s web UI on this agent\'s behalf): `ctxr session land`',
      'is the only merge path, so every landing leaves the same audit trail and passes through the same gate.',
    ];
  },
};

const SESSION_LIFECYCLE: ProcedureSeed = {
  file: 'ctxr-session-lifecycle',
  name: 'Session lifecycle',
  description: 'Start a session worktree, re-scan before any plan, resolve conflicts, and sequence multiple pull requests — the frame ctxr-submit and ctxr-land sit inside.',
  body: (config) => {
    const defaultBranch = config.git.default_branch;
    return [
      'Every write lands via a session worktree and a reviewed pull request; nothing commits to the default',
      `branch (\`${defaultBranch}\`). This skill covers what surrounds a session — starting one, re-scanning before`,
      'any plan, resolving conflicts, and sequencing several pull requests. `ctxr-submit` and `ctxr-land` are',
      'the two verbs at the seams; their steps are not repeated here.',
      '',
      '## Start',
      '',
      '`ctxr session start` creates a worktree on a fresh branch off the fetched default branch; work there.',
      'If you find yourself on the default branch or in the root checkout, stop — `ctxr session list` shows the',
      'active sessions to work in instead.',
      '',
      '## Re-scan before any plan',
      '',
      'Re-scan whenever state may have moved under you — before presenting a plan, before running `ctxr-submit`,',
      'after any gap in the conversation: `git fetch origin`, `git status --short`, `git diff --stat`,',
      '`git diff --cached --stat`, `git ls-files --others --exclude-standard`,',
      `\`git log --oneline origin/${defaultBranch}..HEAD\`. State moves under you while you work; a plan that grows`,
      'between scans is normal. Name the delta from the previous scan rather than silently folding new work into',
      'old buckets.',
      '',
      '## Conflict playbook',
      '',
      `From the session worktree: \`git fetch origin && git rebase origin/${defaultBranch}\`. For each conflicting`,
      'file inspect both sides (`git show`), understand what each represents, and produce a version that keeps',
      'both meanings — never take one side blindly. `git add <file>`, `GIT_EDITOR=true git rebase --continue`,',
      'then `git push --force-with-lease origin <branch>` (aborts if the remote moved underneath you). Never',
      'resolve on the default branch.',
      '',
      '## Multi-PR sequencing',
      '',
      'Parallel when the units are file-disjoint — one `ctxr session start` per unit. Sequential when files',
      'overlap: wait for the merge (`ctxr-land`), then start the next session off the updated default branch.',
      'Worktrees isolate directories, not logical writes: a hot file every session appends to collides at merge',
      'time regardless — sequence those.',
      '',
      '## Reclaiming',
      '',
      '`ctxr session reap` removes merged, clean worktrees (or use `ctxr-land`\'s `--reap`); `ctxr session abandon',
      '<branch>` discards work and needs an explicit go. Never claim cleanup happened without having run one.',
    ];
  },
};

const SESSION_CAPTURE: ProcedureSeed = {
  file: 'ctxr-session-capture',
  name: 'Session capture',
  description: 'At the end of a session, propose durable store notes, world facts, and user facts in one message with per-item approval, then write only what was approved.',
  body: (config) => {
    const worldFactsPath = identityFilePath(config, 'world-facts');
    const userFactsPath = identityFilePath(config, 'user-facts');
    return [
      'End-of-session capture: propose what the session produced that is durable, write only what is approved.',
      'The approval gate is what keeps the blast radius low — nothing is written without it.',
      '',
      '## When',
      '',
      'Fires on the user\'s own closing utterance ("done", "ship it", "that\'s all", a sign-off) or an explicit',
      'request. A request to open a pull request is also a wrap signal — finish the pull request first, then',
      'propose (after the LAST one of a batch, not once per request).',
      '',
      'Anti-triggers — stay silent when: an error, failed test, pending question, or requested follow-up is',
      'outstanding (the session is not over); the recent turns are dominated by tuning the store or this skill',
      'itself (nothing is capturable until that lands and gets used); the items would substantially repeat a',
      'proposal already made this session. The agent\'s own summary never counts as a signal, nor does a cue',
      'word inside quoted text, nor a request for a session summary. Zero durable items → silent; never emit',
      '"scanned, nothing to save".',
      '',
      '## What is durable',
      '',
      'Include: decisions with their rationale; net-new concepts; net-new people, organizations, or',
      'initiatives with context; reusable patterns and playbooks; resolved non-obvious problems worth future',
      'recall; durable preference or environment facts the user corrected you on.',
      '',
      'Exclude: tool output, command traces, transient debugging; anything already in the identity files;',
      'read-only investigation with no conclusion; scratch work that landed on no decision.',
      '',
      'Unsure → propose (the user can decline) — but when in doubt between a note and identity, pick the note:',
      'notes are retrieval-gated, identity is loaded into every session, so its blast radius is higher.',
      '',
      '## Proposal — ONE message, up to three blocks, empty blocks omitted',
      '',
      '```',
      '### Block A — store notes',
      '- A1  path: <layer>/<location>/<Title>.md',
      '      visibility: <value> — <one-line rationale; `ctxr note resolve` on a sibling shows the default>',
      '      sketch: bullets',
      `### Block B — world facts (${worldFactsPath})`,
      '- B1  action: add | replace | remove   (replace/remove name one unique existing line)',
      '      content: "..."',
      `### Block C — user facts (${userFactsPath})`,
      '- C1  action: add',
      '      content: "..."',
      '```',
      '',
      'Secret-marker pass: any item whose content looks like a credential gets `⚠ suspected-secret:` on its',
      'own line with why (patterns worth checking: `sk-`, `ghp_`, `AKIA` + 16 chars, `Bearer …`, a JWT',
      '`eyJ…`, a URL with a token/key/secret parameter). The marker is a hint; the user is the gate.',
      '',
      'End with: "Approve by ID (e.g. `A1 A3 B2`) or `skip`." An edit request → re-propose. An ambiguous',
      'answer → do not proceed.',
      '',
      '## Apply',
      '',
      'Write ONLY the approved items to a YAML proposal file, in the shape `ctxr session capture` reads:',
      '',
      '```yaml',
      'notes:',
      '  - id: A1',
      '    path: <layer>/<location>/<Title>.md',
      '    mode: create            # or: append',
      '    visibility: <value>     # optional; omit to take the location default',
      '    body: |',
      '      matching the frontmatter and style of the sibling notes (`ctxr-placement` decides the location)',
      'world_facts:',
      '  - id: B1',
      '    action: add             # or: replace | remove',
      '    text: "declarative fact, never an imperative"',
      '    match: "..."            # required for replace/remove: a unique substring of the existing entry',
      'user_facts:',
      '  - id: C1',
      '    action: add',
      '    text: "who the user is, not what they did this session"',
      '```',
      '',
      'Then run `ctxr session capture --proposal <file>`. It validates and writes every item independently —',
      'one bad path never blocks the rest — creating or appending notes and applying identity deltas through',
      'the entry primitive. These note commits ride the session pull request (`ctxr-session-lifecycle`). Never',
      `edit \`${worldFactsPath}\` or \`${userFactsPath}\` directly, and never write identity through a`,
      'harness-specific memory mechanism — the command is the only writer.',
      '',
      '## Report from actual writes',
      '',
      'Report exactly what the command reported — wrote / appended / refused (with reason) / skipped, by ID —',
      'never from the proposal itself. A refused item is surfaced prominently with its reason.',
    ];
  },
};

const DERIVED_ARTIFACTS: ProcedureSeed = {
  file: 'ctxr-derived-artifacts',
  name: 'Derived artifacts',
  description: 'Refresh a generated artifact safely — check before build, read the counts back, never hand-edit inside a fence, keep derived files out of content commits.',
  body: (config) => {
    const defaultBranch = config.git.default_branch;
    return [
      'A derived artifact is the deterministic output of a build over the store: catalog sections, the graph,',
      'the generated AGENTS.md sections, the entry files, the owned skills, adapter outputs. They rot two ways —',
      'stale (the source moved, the artifact did not) and clobbered (a build against the wrong base, or a hand',
      'edit inside a fence that the next build erases).',
      '',
      '1. Identify the source of truth and the builder: catalog ← notes (`ctxr catalog build`); graph ← notes',
      '   (`ctxr graph build`, lives under the cache paths, never committed); AGENTS.md sections, entry files,',
      '   skills, hooks ← config + the installed package (`ctxr update`); adapter outputs ← config',
      '   (`ctxr adapters generate`).',
      '2. Check BEFORE you build: `ctxr catalog check` (add `--stale` for glosses whose note changed) and',
      '   `ctxr doctor`. Zero coverage, a parse error, or a count far below the store\'s real note count means',
      '   the builder and the base disagree — STOP; a build now writes a broken or empty artifact. Fix the base,',
      '   or hand-add only your entries, matching the committed structure, and say so in the commit message.',
      '3. Build, then read the result back: reported counts against the source (notes vs catalog entries, graph',
      '   nodes vs notes); your new notes present with non-zero links; nothing else lost.',
      '4. Fences: never hand-edit inside a `contexture:<region>` fence — the next build overwrites it. Hand',
      '   edits OUTSIDE a fence (catalog glosses, prose around a generated section) are preserved by every',
      '   build and are the right place for them.',
      '5. Commits: artifacts under the cache paths never stage. Committed derived files (the catalog) ride',
      '   their own small change AFTER the content lands, path-scoped (`git add <path>`), never swept up with',
      '   `-A` in a checkout other sessions use.',
      `6. Verify the remote, not the claim: after "it's merged", \`git fetch origin\` and`,
      `   \`git show origin/${defaultBranch}:<path> | grep -c <marker>\` before treating the loop as closed.`,
    ];
  },
};

const ORGANIZE_AUDIT: ProcedureSeed = {
  file: 'ctxr-organize-audit',
  name: 'Organize audit',
  description: 'Audit store health with ctxr lint (observations) and ctxr doctor (blocking invariants), retire by moving, and classify broken links before fixing them.',
  body: () => [
    '1. Run `ctxr lint` for the full health report — orphan notes, broken links, uningested inbox material,',
    '   catalog gaps. It always exits 0; its findings are observations for judgment, never a block.',
    '2. Run `ctxr doctor` for the invariants that DO block: catalog coverage, fail-closed visibility, hook',
    '   health, and more. Address doctor\'s failures before `ctxr session submit`; it runs the same checks.',
    '',
    '## Placement review',
    '',
    'The diagnostic that works: "what standard am I maintaining here, and what is my review cadence?" A',
    'location reviewed on a cadence is an ongoing responsibility; one touched only when its material is needed',
    'is reference — whatever its label says. Apply a file-count sanity check first: dozens of reference',
    'readings under a responsibility label is drift. Watch for topic libraries creeping back into layers',
    'organized by actionability. Single-note calls go through `ctxr-placement`.',
    '',
    '## Retiring: move, don\'t tag',
    '',
    'A status tag left in place defeats the layer — the active layers must show only active work.',
    '`ctxr archive <path>` moves the note into the configured archive location as a tracked rename; the',
    'visibility field travels unchanged (never rewrite it on the move). Retiring is reversible cold storage,',
    'not deletion. Verify with `git status --short` showing `R` (a rename, history preserved), not a delete',
    'plus an add, then `ctxr catalog check`.',
    '',
    '## Broken links have classes — classify before fixing',
    '',
    '- URL wrapped in wikilink syntax → convert to a markdown link.',
    '- Basename collision (differs from an existing note only by case, hyphenation, or display name) →',
    '  rewrite with `[[Real Name|display]]` alias syntax.',
    '- Dangling: bugs (typos, accidental self-references, a path rewrite that hit a folder name) get fixed;',
    '  healthy forward references (a name you may write about later, a planned hub) are intent markers —',
    '  leave them. Never fabricate stub notes to silence them; a one-line stub hides the real TODO and makes',
    '  orphan analysis lie.',
    '',
    '## Moves at scale',
    '',
    'Two commits, never a broken intermediate: commit 1 = the moves PLUS the wikilink fixes they require;',
    'commit 2 = tooling and doc patches. Before the moves, grep for hardcoded references to the old paths.',
    'After they land, rebuild the derived artifacts (`ctxr-derived-artifacts`) and re-run `ctxr lint`.',
  ],
};

export const PROCEDURES: readonly ProcedureSeed[] = [
  INGEST_ORCHESTRATION,
  PLACEMENT,
  CONNECTION_FINDING,
  CONNECTION_PROPOSAL,
  ROLLUP,
  SESSION_LIFECYCLE,
  SUBMIT,
  LAND,
  SESSION_CAPTURE,
  DERIVED_ARTIFACTS,
  ORGANIZE_AUDIT,
];

/** The owned skills, rendered against one store's configuration — what `syncShippedSkills` writes. */
export function renderProcedures(config: StoreConfig): Procedure[] {
  return PROCEDURES.map((seed) => ({
    file: seed.file,
    name: seed.name,
    description: seed.description,
    content: skillDocument(seed, config),
  }));
}

/**
 * entry-doc-generation spec: every skill actually on disk — the contexture-
 * owned ones plus any operator-authored ones. This is what the AGENTS.md
 * index and verify --portable consume; the static PROCEDURES const is only
 * the canonical content syncShippedSkills writes.
 */
export function scanProcedures(root: string, config: StoreConfig): Promise<ScannedDoc[]> {
  return scanDocsDir(root, config.harness.procedures_path);
}

export function procedurePaths(config: StoreConfig): string[] {
  return PROCEDURES.map((p) => path.join(config.harness.procedures_path, p.file, SKILL_FILE_NAME).split(path.sep).join('/'));
}

/**
 * Brings every contexture-owned skill copy to the installed package's
 * content: written when missing, rewritten when different (byte-stable —
 * an up-to-date copy is not touched). Managed copies the installed version
 * no longer ships (recognised by the managed header) are removed, so a
 * renamed slug never leaves an orphan behind. Only files bearing the header
 * are ever removed; operator skills are untouched. Returns every path it
 * wrote or removed.
 */
export async function syncShippedSkills(root: string, config: StoreConfig): Promise<string[]> {
  const changed: string[] = [];
  for (const procedure of renderProcedures(config)) {
    const relativePath = path
      .join(config.harness.procedures_path, procedure.file, SKILL_FILE_NAME)
      .split(path.sep)
      .join('/');
    const absolutePath = path.join(root, relativePath);
    let existing: string | undefined;
    try {
      existing = await readFile(absolutePath, 'utf8');
    } catch {
      existing = undefined;
    }
    if (existing !== procedure.content) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFileAtomic(absolutePath, procedure.content);
      changed.push(relativePath);
    }
  }

  const shippedSlugs = new Set(PROCEDURES.map((p) => p.file));
  const skillsDir = path.join(root, config.harness.procedures_path);
  let entries: { name: string; isDirectory(): boolean }[] = [];
  try {
    entries = await readdir(skillsDir, { withFileTypes: true });
  } catch {
    entries = [];
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || shippedSlugs.has(entry.name)) continue;
    const skillFile = path.join(skillsDir, entry.name, SKILL_FILE_NAME);
    let content: string;
    try {
      content = await readFile(skillFile, 'utf8');
    } catch {
      continue;
    }
    if (!content.includes(MANAGED_SKILL_HEADER)) continue; // operator-authored: never touched
    await rm(path.join(skillsDir, entry.name), { recursive: true, force: true });
    changed.push(path.join(config.harness.procedures_path, entry.name, SKILL_FILE_NAME).split(path.sep).join('/'));
  }
  return changed;
}
