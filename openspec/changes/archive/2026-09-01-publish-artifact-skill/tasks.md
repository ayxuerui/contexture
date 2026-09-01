## 1. Config: the publish path

- [x] 1.1 Add `DEFAULT_PUBLISH_PATH = '.contexture/publish/'` to `src/config/defaults.ts`, next to `DEFAULT_CATALOG_PATH`.
- [x] 1.2 Add a `PublishSchema = z.object({ path: z.string().min(1).default(DEFAULT_PUBLISH_PATH) })` to `src/config/schema.ts` and add `publish: PublishSchema` to `StoreConfigSchema`, per design.md's schema-optional-with-default decision.
- [x] 1.3 Have `src/commands/init.ts` write `publish: { path: DEFAULT_PUBLISH_PATH }` into a freshly generated `contexture.yaml`, matching how `catalog`/`harness` are populated.
- [x] 1.4 Add `config.publish.path` to the prefix list in `excludedPrefixesFor` (`src/core/notes/list.ts`), alongside `config.catalog.path` and `config.harness.skills_path`.
- [x] 1.5 Verify: `npm run typecheck` passes; a unit test asserting a `contexture.yaml` with no `publish:` key still parses via `readConfig` and resolves `config.publish.path` to the default.

## 2. Disclosure aggregation

- [x] 2.1 Add a `worstVerdict(verdicts: DisclosureVerdict[]): DisclosureVerdict` helper (most-restrictive-member ordering: DENY > ASK > ALLOW) near `evaluateDisclosure` in `src/core/disclosure/model.ts`, implementing the new disclosure-policy requirement.
- [x] 2.2 Verify: a unit test table covering all-ALLOW, one-ASK-no-DENY, and one-DENY-anywhere inputs, asserting the aggregate and reusing `VERDICT_EXIT_CODE` (`src/commands/check.ts:29`) to check the mapped exit code.

## 3. `ctxr publish gather`

- [x] 3.1 Add `src/commands/publish-gather.ts`: accept exactly one of `--under <prefix>`, `--note <path>`, `--entity <name>`, `--as <context>`, plus `--audience <audience>`; resolve the note set (reusing `listNotes(..., { underPrefix })` for `--under`, `parseNote` for `--note`, the same backlink enumeration as `src/commands/rollup-gather.ts` for `--entity`, and `canSee`/`resolveVisibility` per `src/core/graph/visibility-filter.ts:28` for `--as`).
- [x] 3.2 Evaluate every resolved note through `evaluateDisclosure`/`scanNoteForLeaks`; return per-note `{ path, verdict, rung, leaks }` and the resolved count (including zero) in `CommandOutcome.data`.
- [x] 3.3 Set the command's exit code from `worstVerdict` over the per-note verdicts via `VERDICT_EXIT_CODE`, defaulting to `ExitCode.Ok` on an empty set.
- [x] 3.4 Refuse (usage error, matching `CheckAudienceRequiredError`'s shape) when `--audience` is missing, and when zero or more than one selector flag is given.
- [x] 3.5 Wire `publish gather` into `src/run.ts` under a new `publish` command group, following the `rollupCommand`/`checkCommand` registration pattern.
- [x] 3.6 Verify: `node dist/bin.js publish gather --under <prefix> --audience <ctx> --json` against a scratch store returns per-note verdicts and the documented exit code; repeat for `--note`, `--entity`, `--as`, and for a subject containing one DENY-walled note (exit code is the wall's, not ALLOW).

## 4. `ctxr publish new`

- [x] 4.1 Add `src/commands/publish-new.ts`: refuse (non-zero, naming the reason) a `<slug>` beginning with the reserved date pattern (`YYYY-` or `YYYY-MM-DD-`); refuse (non-zero) if a folder already exists at `<publish.path>/<slug>/`.
- [x] 4.2 On success, create `<publish.path>/<slug>/` with a minimal `index.html` skeleton (doctype, viewport meta, one `@media print` rule, no CSS system, no CDN reference) and a sibling `README.md` carrying the required headings (Intent, Source notes, Audience & use, Spec / prompt).
- [x] 4.3 Wire `publish new <slug>` into `src/run.ts`.
- [x] 4.4 Verify: `node dist/bin.js publish new some-slug` creates the folder and README; a second run against the same slug exits non-zero and leaves it untouched; `node dist/bin.js publish new 2026-01-01-bad` exits non-zero and creates nothing.

## 5. `ctxr publish check`

- [x] 5.1 Add `src/commands/publish-check.ts`: given a page's `index.html` path, run each structural check independently (no external `http(s)://` in `src`/`href`; viewport meta present; at least one `@media print` rule; a provenance line pairing a date with a link to the sibling README; sibling README exists; sibling README's frontmatter has neither the visibility field nor a `kind` key) and collect every failure rather than stopping at the first.
- [x] 5.2 Add the tag-balance pass (fixed tag list, `<script>`/`<style>`/comments stripped before counting) and, for each `<script>` block present, a syntax pass via `node --check` on the extracted block (child_process, matching `check-artifact-js.py`'s approach reimplemented in TS).
- [x] 5.3 Exit non-zero naming every failing check by name when any check fails; exit 0 naming none when all pass.
- [x] 5.4 Wire `publish check <path>` into `src/run.ts`.
- [x] 5.5 Verify: run against a page missing its README (fails, names the check), a page with an external CDN reference (fails, names the check), a page with a deliberately broken inline `<script>` (fails, names the script block), and a page from task 4.4 (passes).

## 6. The `ctxr-publish` skill

- [x] 6.1 Write `templates/skills/ctxr-publish.md`: the decision procedure from design.md — trigger heuristic, gate-before-copy via `publish gather`, identity via `publish new`, form chosen from content shape with craft delegated to a configured/present skill, output invariants verified by `publish check`, retrieval exclusion, provenance/drift discipline, landing via `ctxr-submit`.
- [x] 6.2 Add a `PUBLISH: SkillSeed` const to `src/core/skills.ts` (`file: 'ctxr-publish'`, `name: 'Publish'`, one-line `description` with no `": "`), appended to the `SKILLS` array.
- [x] 6.3 Verify: `npm run build && node dist/bin.js init --root /tmp/pub-check` writes `.claude/skills/ctxr-publish/SKILL.md` with the managed header and is indexed in the generated `AGENTS.md`.

## 7. Existing tests updated for the 13th skill

- [x] 7.1 Update the ordered slug list and count in `test/unit/skills.test.ts` (`:63`, `:330`).
- [x] 7.2 Update `test/integration/owned-skills.test.ts` (`:44` count, `:20` `SKILLS_ADDED_BY_THIS_RELEASE`).
- [x] 7.3 Update the literal `git add --` vector in `test/unit/git-sequence.test.ts` (`:47-60`) to include `.claude/skills/ctxr-publish/SKILL.md` at the matching index.
- [x] 7.4 Add a `describe` block in `test/unit/skills.test.ts` asserting `ctxr-publish`'s load-bearing rules (gate before copy, ASK stops and names the note, identity fixed once, excluded from retrieval, craft delegated not invented), matching the per-skill pattern every other skill has.
- [x] 7.5 Verify: `npm test` passes in full.

## 8. Final verification

- [x] 8.1 `npm run typecheck && npm run build && npm test` — all green.
- [x] 8.2 Against a scratch store, run the full sequence from design.md/proposal.md's Impact: `init` → `publish gather` (all four selectors, including a walled note) → `publish new` (success, collision, bad-slug cases) → `publish check` (pass and each failure case) → `verify --portable`.
- [x] 8.3 `openspec validate publish-artifact-skill --strict` exits 0.
