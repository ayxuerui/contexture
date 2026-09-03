Decide where a note lives BEFORE writing it, and say why: the caller wants the reasoning (which layer, why
this location over its sibling, what would promote it) so they can push back — not a
folder name. Answer the questions in order; stop early only when the content clearly resolves.

__LAYER_STEP__

## 2. Which location within the layer?

- Match on what the content IS. When two sibling locations both seem to fit, name the distinction between
  them (abstract vs concrete; outward-facing vs inward-facing; who-we-are vs how-it-runs) and pick by
  altitude and audience, not by keyword.
- Read one or two sibling notes in the chosen location and match their shape — frontmatter keys, heading
  style, bullets vs prose — before writing.

## 3. Sub-item under an existing location, or a new top-level one?

Default to a sub-item until it earns promotion. A near-empty top-level location is its own kind of
clutter — worse than a slightly crowded existing one. Starting small and promoting later is cheap;
starting big and hollow is not. Make the promotion trigger a rule, not a vibe, and write it INTO the
note: "Promote to its own top-level location the moment this holds 3+ distinct notes or topics."

## 4. What must never enter the store?

Credentials, full account numbers, and secrets never enter the store — last-4 only. This is a placement
input, not a cleanup step: if the content cannot be written without them, it does not belong here.

## Perishable vs durable

One capture often mixes a durable fact with perishable specifics. The durable part (the reusable
structure, mechanic, or trap) goes into the permanent note. The perishable part (this period's values,
links, boilerplate) goes into a fenced `contexture:<region>` block you OVERWRITE on each refresh, never
an accumulating pile of dead entries. Do not ingest a perishable item as source material — that
manufactures an artifact for the graveyard; capture the durable slice by hand instead.

## Wire it in

Add a one-line wikilink from the relevant hub note so the new note is not an orphan; `ctxr lint` flags
orphans and notes without a catalog entry.

## Relocating an existing note

`ctxr archive <path>` to retire it; a plain tracked `git mv` for an ordinary re-placement. Either way the
note's frontmatter is left untouched.

## Verify

`ctxr lint` for orphans and catalog gaps; `ctxr doctor` for anything that blocks a submit.
