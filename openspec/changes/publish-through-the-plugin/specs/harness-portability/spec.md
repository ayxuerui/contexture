## MODIFIED Requirements

### Requirement: The shared skills are one text on both surfaces
The owned skills the plugin carries SHALL be one text, from one template, that an agent follows in a shell running `ctxr` or through the store's server's tools. Each SHALL open with one shared section saying how to tell the two apart and how a `ctxr` step, a path and a commit are done through the server. A store's copy and the plugin's copy SHALL differ only in store values, which the plugin names by placeholders. The second-opinion skill SHALL be one of them, since the store's server runs `ctxr second-opinion`. The publish skill SHALL be one of them, since the store's server runs the `publish` commands and its file tools reach the published-pages location. The upgrade and Circleback skills, which run other local programs, and the land and derived-artifacts skills SHALL stay out of it. The enforcing mechanism is the test over the shared set, which fails naming any skill added to or missing from the declared list.

#### Scenario: A store's copy and the plugin's copy differ only in values
- **WHEN** a shared skill is rendered for a store and for the plugin
- **THEN** replacing each of the store's values in the store's copy by its placeholder yields the plugin's copy

#### Scenario: The plugin carries no shell-only skill
- **WHEN** the plugin is built
- **THEN** it carries the capture, second-opinion and publish skills with the shared section, and not the upgrade or land skills

#### Scenario: The publish skill names only what the server offers
- **WHEN** the drift check runs over the plugin's render of the publish skill
- **THEN** it reports no finding: every `ctxr publish` command it names is routed by a runner, and `ctxr serve` is marked unavailable, with its step saying how a page is looked at through the server

### Requirement: The publish skill settles a page's lifespan before anything else
The rendered `ctxr-publish` skill SHALL instruct, as its first numbered step after the shared opening section and ahead of resolving any note
set, deciding whether the page is permanent — the rendered form of one note that will keep changing —
or disposable, built to understand something once. For a disposable page it SHALL instruct
scaffolding with `ctxr publish new --disposable`, never revising the page once it has landed, and
leaving its removal to the operator when lint lists it. For a permanent page it SHALL instruct leading
the README's source notes with the one note the page represents — for a page drawn from a store
folder, that folder's hub note — stamping it with `ctxr publish stamp`, and, when a page is reported
stale, reviewing the page against the note before removing the marker and stamping again. It SHALL
state that a page meant to be kept which can name no note it represents is disposable. The enforcing
mechanism is the test over the rendered skill set.

#### Scenario: Lifespan is the first decision
- **WHEN** the publish skill is rendered for a store
- **THEN** its first numbered step, after the shared opening section, decides between a permanent and a disposable page, and appears before the
  step that resolves the subject's note set

#### Scenario: A disposable page is scaffolded by option and never revised
- **WHEN** an agent follows the publish skill for a disposable page
- **THEN** it is instructed to scaffold with `ctxr publish new --disposable`, not to edit the page after
  it lands, and not to remove it unasked

#### Scenario: A permanent page is led by its note and stamped
- **WHEN** an agent follows the publish skill for a permanent page
- **THEN** it is instructed to lead the README with the represented note, run `ctxr publish stamp`, and
  confirm a stale page by review before removing its marker and stamping again

## ADDED Requirements

### Requirement: The plugin opens publishing by a typed command
The plugin's command map SHALL map `publish` to `ctxr-publish`, so `/contexture:publish` opens that skill's render through the same check as every other command.

#### Scenario: The publish command opens its skill
- **WHEN** the plugin is built
- **THEN** `commands/publish.md` carries the `ctxr-publish` render followed by the person's arguments

### Requirement: The publish skill says how its shell-only steps go through the server
Through the store's server, the rendered `ctxr-publish` skill SHALL have the agent hand the person the page's preview address at the step that looks at the page, and SHALL say at the send-copy step that send copies are not made there. The enforcing mechanism is the test over the rendered skill set, with the drift check.

#### Scenario: Looking at a page through the server
- **WHEN** the publish skill is rendered for the plugin
- **THEN** the step that starts `ctxr serve` also says how the page is looked at through the store's server, and that an unseen page is reported as not checked visually

#### Scenario: No send copy through the server
- **WHEN** the publish skill is rendered for the plugin
- **THEN** the send-copy step says send copies are not made through the store's server

### Requirement: The plugin carries the default craft skills with their licenses
Both plugins `ctxr plugin build` writes SHALL carry, for each vendored skill a store gets by default, the packaged copy's `SKILL.md` and `LICENSE.txt` unchanged under `skills/<name>/`, and a `THIRD_PARTY_NOTICES.md` naming each one's source, pinned revision and license. They SHALL NOT carry the copy's provenance record. The enforcing mechanism is the committed-plugin test, which fails naming the file when a carried copy differs from the packaged one or a default vendored skill is missing.

#### Scenario: The craft skills ship with the plugin
- **WHEN** the plugin is built
- **THEN** `skills/frontend-design/SKILL.md` and `skills/eli5/SKILL.md` equal the packaged copies, each sits beside its `LICENSE.txt`, and `THIRD_PARTY_NOTICES.md` names both

#### Scenario: A re-vendored skill fails the committed plugin until it is rebuilt
- **WHEN** a packaged vendored skill changes and `plugins/contexture/` is not regenerated
- **THEN** the committed-plugin test fails naming that skill's file
