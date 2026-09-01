## Why

Store content sometimes needs to leave the store as a shareable HTML page — a project board, an area
review, a concept explainer — and today contexture offers no store-side procedure for that at all. An
operator-built convention observed in production (a vault's `knowledge-artifact-pages` skill) shows
the durable rules this needs — one self-contained file per subject, a sibling README recording
provenance, kind encoded once in the folder name, style inherited rather than invented — but its one
real gap is disclosure: it defends confidential subject matter with a documented convention and a
cosmetic badge, not a mechanism, even though `ctxr check` already computes a real ALLOW/DENY/ASK
verdict per note. That gate has never been wired to multi-note, audience-facing output. This change
gives contexture a shipped skill and a small command family that put the existing per-note disclosure
gate in front of every note a shareable page would draw from, before any content is copied out — the
piece no operator convention alone can enforce.

## What Changes

- Add a new **publish** capability: a subject resolves to a set of source notes (a folder, a single
  note, an entity's backlinks, or everything a named context admits), the set is evaluated through the
  existing disclosure gate before a word is copied out, and the aggregate verdict is the worst verdict
  in the set — DENY over ASK over ALLOW.
- Add three commands: `ctxr publish gather` (resolve + gate, returns per-note verdicts), `ctxr publish
  new <slug>` (scaffold a page's folder and README, refusing an identity that collides with the
  frozen-snapshot naming convention), `ctxr publish check <path>` (mechanized structural checks: no
  external references, a viewport meta, a print rule, a provenance line, a sibling README, embedded
  script syntax).
- Add a 13th contexture-owned skill, `ctxr-publish`: the decision procedure — when a page earns its
  cost over a note, gate before copying, fix identity once, inherit visual style from a configured or
  present craft skill rather than inventing one, keep the page out of the retrieval corpus, keep the
  source note as the fact of record.
- Add a new configured location for published pages, alongside the existing catalog and skill pack
  locations under the store's tool-owned home directory, excluded from retrieval by default.

## Capabilities

### New Capabilities

- `publish`: subject resolution (folder / note / entity / context) into a disclosure-gated note set,
  the worst-verdict aggregate, and the page-identity and structural-check commands built on it.

### Modified Capabilities

- `harness-portability`: the shipped-skills requirement gains `ctxr-publish` as a 13th owned skill.
- `disclosure-policy`: a new requirement for evaluating a set of notes as one unit and reporting the
  worst verdict, which `publish gather` is built on.
- `context-store`: the tool-owned-home-directory requirement's list of tracked subdirectories gains
  the default publish path.

## Non-goals

- **Any HTML renderer, template, or visual palette shipped by contexture.** A generic
  markdown-to-HTML pipeline fights the same form-fits-content principle the source convention was
  built on — a page is a bespoke representation chosen for its subject, not a mechanical render, and
  contexture is not positioned to make that editorial judgment. `ctxr-publish` delegates the actual
  HTML/CSS craft to whatever design-focused skill the store has configured or has installed as an
  operator skill; contexture ships none itself.
- **Vendoring a third-party HTML-artifact skill into contexture's shipped set.** Surveyed candidates
  fail contexture's own shipped-skill guards on ordinary prose (a case-insensitive word-boundary check
  against tier words like "shared" false-positives on generic English), and their value is multi-file
  reference documents loaded on demand — contexture's skill packaging writes and diffs exactly one
  `SKILL.md` per skill today. Extending that packaging to multi-file skills is a real, separate change
  this proposal does not make. An operator can install such a skill directly, untouched by contexture's
  sync, which is the intended path.
- **Serving published pages or notes over HTTP.** Contexture has no server surface today; adding one
  is a distinct capability with its own security posture (which requester sees what) that deserves its
  own proposal, and should build on a filtered per-requester materialization rather than gating a live
  directory per request, once that materialization exists.
- **A generated gallery or catalog file for published pages.** The convention this change generalizes
  from had one, and it drifted from its generated HTML twice in production. Rather than porting the
  generator, this change keeps no second hand-maintained catalog to drift against; discovering what has
  been published is left to filesystem enumeration (and, later, the deferred serving capability) rather
  than a new committed index this change would have to keep in sync.
- **Packaged export formats (PDF, slide decks).** Out of scope; the source convention's PDF-export path
  is unaffected by this change and is not generalized here.

## Impact

Affected code: three new commands (`src/commands/publish-gather.ts`, `publish-new.ts`,
`publish-check.ts`) wired into `src/run.ts`; a new skill seed and template
(`src/core/skills.ts`, `templates/skills/ctxr-publish.md`); a new config field and default path
constant (`src/config/schema.ts`, `src/config/defaults.ts`) plumbed into
`excludedPrefixesFor` (`src/core/notes/list.ts`); a small multi-note disclosure evaluation helper
reused by `publish gather` and built from the existing single-note `evaluateDisclosure` /
`scanNoteForLeaks` functions.

Affected stores: additive. A store that never runs `ctxr publish` gains an unused default config
value and one more skill file on the next `ctxr update`; no existing command's behavior changes, and
`ctxr check <note>` (single-note form) is unchanged.

No new runtime dependency, no config-schema breaking change, no migration.
