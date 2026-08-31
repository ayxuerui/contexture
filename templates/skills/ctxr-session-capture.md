End-of-session capture: propose what the session produced that is durable, write only what is approved.
The approval gate is what keeps the blast radius low — nothing is written without it.

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

## Proposal — ONE message, empty proposal omitted

```
### Store notes
- A1  path: <layer>/<location>/<Title>.md
      visibility: <value> — <one-line rationale; `ctxr note resolve` on a sibling shows the default>
      sketch: bullets
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

## Report from actual writes

Report exactly what the command reported — wrote / appended / refused (with reason) / skipped, by ID —
never from the proposal itself. A refused item is surfaced prominently with its reason.
