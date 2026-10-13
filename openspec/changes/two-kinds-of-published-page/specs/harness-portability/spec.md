## ADDED Requirements

### Requirement: The publish skill settles a page's lifespan before anything else
The rendered `ctxr-publish` skill SHALL instruct, as its first step and ahead of resolving any note
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
- **THEN** its first step decides between a permanent and a disposable page, and appears before the
  step that resolves the subject's note set

#### Scenario: A disposable page is scaffolded by option and never revised
- **WHEN** an agent follows the publish skill for a disposable page
- **THEN** it is instructed to scaffold with `ctxr publish new --disposable`, not to edit the page after
  it lands, and not to remove it unasked

#### Scenario: A permanent page is led by its note and stamped
- **WHEN** an agent follows the publish skill for a permanent page
- **THEN** it is instructed to lead the README with the represented note, run `ctxr publish stamp`, and
  confirm a stale page by review before removing its marker and stamping again

### Requirement: The organize-audit skill hands disposable-page removal to the operator
The rendered `ctxr-organize-audit` skill SHALL instruct taking lint's list of disposable pages past
their window to the operator as a proposal, removing only the pages the operator approves, through a
session and a reviewed pull request like any other change, and naming each removed page's address as
one that stops working. It SHALL hand permanent pages lint reports as out of step with their note to
the publish skill. The enforcing mechanism is the test over the rendered skill set.

#### Scenario: Removal is proposed, never assumed
- **WHEN** an agent follows the organize-audit skill and lint lists disposable pages past their window
- **THEN** it is instructed to propose their removal to the operator and remove only what is approved

#### Scenario: A drifted page goes to the publish skill
- **WHEN** an agent follows the organize-audit skill and lint lists a permanent page as stale
- **THEN** it is instructed to hand that page to the publish skill rather than restamp it

### Requirement: Submit's Pages table names each page's lifespan
When the rendered `ctxr-submit` skill instructs a Pages section in the pull request body, it SHALL
instruct that each page's row carry the lifespan `ctxr publish urls` reports for it, copied from the
report rather than inferred from the path. The enforcing mechanism is the test over the rendered skill
set.

#### Scenario: The Pages table carries the lifespan
- **WHEN** an agent follows the rendered submit skill and `ctxr publish urls` lists a disposable page
- **THEN** the Pages table row for that page names it as disposable, taken from the report
