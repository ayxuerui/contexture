End-of-session capture: propose what the session produced that is durable, write only what is approved.
The approval gate is what keeps the blast radius low — nothing is written without it.

A session produces durable material in two shapes, and they go to different places: a **fact** about
what happened is a note; a **rule** for how future work should go is a convention, and belongs in this
store's house conventions at `__HOUSE_CONVENTIONS_PATH__`, which is inlined into AGENTS.md and so loads
at the start of every session. One pass proposes both.

## When

Fires on the user's own closing utterance ("done", "ship it", "that's all", a sign-off) or an explicit
request. A request to open a pull request is also a wrap signal — finish the pull request first, then
propose (after the LAST one of a batch, not once per request).

Anti-triggers — stay silent when: an error, failed test, pending question, or requested follow-up is
outstanding (the session is not over); the recent turns are dominated by tuning the store or this skill
itself (nothing is capturable until that lands and gets used); the items would substantially repeat a
proposal already made this session. The agent's own summary never counts as a signal, nor does a cue
word inside quoted text, nor a request for a session summary. Zero durable items → silent; never emit
"scanned, nothing to save".

## What is durable

Include: decisions with their rationale; net-new concepts; net-new people, organizations, or
initiatives with context; reusable patterns and playbooks; resolved non-obvious problems worth future
recall; durable preference or environment facts the user corrected you on.

Exclude: tool output, command traces, transient debugging; read-only investigation with no conclusion;
scratch work that landed on no decision.

Unsure → propose (the user can decline).

## What is a convention

A convention is a rule for future work. The test that separates it from a note: a note records that
something happened, a convention changes what happens next. "We chose Postgres, because X" is a note.
"Name migrations with the date first, because they sort" is a convention.

The default answer is NO — a store that gains a convention every session ends with a bloated,
self-contradicting document nobody reads. Propose one only when all four hold:

- It is a rule for future work, not a fact about past work.
- It applied more than once, or the user stated it as a correction.
- It is store-wide. A rule about one folder belongs in that folder's `README.md`, not here.
- It is not already in the shipped baseline — read that file first. Restating contexture's own
  behavior as a house rule is the most likely way to get this wrong.

Propose REMOVALS on the same bar: a convention the session contradicted, or that no longer matches how
work actually goes, is worse than none — it teaches the next agent something false. The inlined section
also has a hard ceiling (`harness.convention_max_bytes`), so growth-only is not a maintenance strategy.

Each entry states the rule, why it exists, and how to apply it. The Why is not decoration: without the
observation that earned it, no future reader can tell whether a rule still holds or whether a one-off
calcified, so it never gets retired.

## Proposal — ONE message, empty proposal omitted

```
### Store notes
- A1  path: <layer>/<location>/<Title>.md
      visibility: <value> — <one-line rationale; `ctxr note resolve` on a sibling shows the default>
      sketch: bullets

### House conventions
- C1  add · <section> — <the rule, as an imperative>
      why: <what goes wrong without it — the observation this session produced>
      apply: <what to do concretely>
- C2  remove · <the rule, quoted> — <what contradicted it>
```

Secret-marker pass: any item whose content looks like a credential gets `⚠ suspected-secret:` on its
own line with why (patterns worth checking: `sk-`, `ghp_`, `AKIA` + 16 chars, `Bearer …`, a JWT
`eyJ…`, a URL with a token/key/secret parameter). The marker is a hint; the user is the gate.

End with: "Approve by ID (e.g. `A1 A3`) or `skip`." An edit request → re-propose. An ambiguous
answer → do not proceed.

## Apply

Write ONLY the approved items to a YAML proposal file, in the shape `ctxr session capture` reads:

```yaml
notes:
  - id: A1
    path: <layer>/<location>/<Title>.md
    mode: create            # or: append
    visibility: <value>     # optional; omit to take the location default
    body: |
      matching the frontmatter and style of the sibling notes (`ctxr-placement` decides the location)
```

Then run `ctxr session capture --proposal <file>`. It validates and writes every item independently —
one bad path never blocks the rest. These note commits ride the session pull request
(`ctxr-session-lifecycle`).

Approved conventions are a direct edit to `__HOUSE_CONVENTIONS_PATH__`, never the YAML above: `ctxr
session capture` writes NOTES — it takes a path, a visibility, and a body, and stamps the visibility
field — and a guidance file is not a note and carries no visibility. Edit it under the matching
section, then run `ctxr update` so AGENTS.md re-inlines it, and stage BOTH in the same commit: a staged
guidance change without a matching staged AGENTS.md regeneration fails `doctor --staged` and the
pre-commit hook refuses it. If the file does not exist yet (a store migrated in from before it was
seeded), say so in the proposal and create it with the approved entries — never unasked.

## Report from actual writes

Report exactly what the command reported — wrote / appended / refused (with reason) / skipped, by ID —
never from the proposal itself. A refused item is surfaced prominently with its reason. For conventions,
report the section each entry landed in or was removed from, and that `ctxr update` re-inlined them.
