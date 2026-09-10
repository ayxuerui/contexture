## Context

See proposal.md — *Why*. The distinction the change turns on:

- **A vendored skill** is a third party's file. contexture redistributes it and may not modify it, which is
  why an operator's edit is preserved and reported and why the record carries a hash to detect one.
- **A shipped note template** is contexture's own file, and a *starting shape* rather than content. A note
  cut from one diverges immediately; that is the point. Nothing inside the template is operator work.

The implementation copied the first contract wholesale because the delivery mechanics matched. The
ownership question is the part that did not.

## Goals / Non-Goals

**Goals:**

- One rule: a name the packaged library uses is contexture's; every other name at that path is the store's.
- Fewer moving parts than before the change, not more.

**Non-Goals:**

- No change to vendored skills. No enforcement that prevents an edit. No per-template opt-out.

## Decisions

### D1 — Ownership follows the name, not the bytes

The old rule was "contexture manages a file if and only if the record names it, and only while its hash
matches." Two conditions, one of them time-varying, and the second is what produced the override.

The new rule is "contexture manages a file if the packaged library uses its name." One condition, decidable
without reading the file's history, and it gives a store a clear place to stand: pick another name.

This is also what makes the *retired-template* case answerable. Under the old rule an edited copy of a
template contexture had stopped shipping was preserved indefinitely — a file at a contexture-shaped name
that contexture no longer explains. Now it is removed with the rest.

### D2 — Drop the hash, keep the record

With no preserve decision to make, the hash has no reader. Byte-stability — the property that a second
`ctxr update` writes nothing — is better served by comparing the file to the bytes it should have, which is
exact rather than a proxy for exactness and needs nothing stored.

The record itself stays, reduced to the list of names contexture delivered, because that is genuinely not
derivable: when the packaged library drops a template, only the record remembers the store ever had it.

*Alternative considered:* drop the record entirely and remove any file at a packaged name the store no
longer declares. Rejected — it cannot see a name the library itself has retired, which is exactly the case
the record exists for.

### D3 — Breaking, and quietly so

A store that edited a shipped template loses the edit on its next update, with no finding to announce it —
the finding is what this change removes. That is the correct shape for a change whose whole claim is that
the file was never the operator's, but it is worth stating plainly rather than discovering.

No store on this machine is affected: the origin store took the shipped set unmodified. Had one been, the
migration is copying the file to another name first, which is the same one-line action the new rule
recommends generally.

## Risks / Trade-offs

- **An operator's edit disappears silently on update.** → By design (D3), and mitigated by the alternative
  being obvious and cheap: a house variant lives under its own name, where nothing touches it. The prior
  behaviour's cost — a store frozen out of every future improvement to a template it once touched — is the
  larger one, and it accrues silently too.
- **"Ownership follows the name" means a store cannot use a packaged name for its own kind.** → True, and
  intended: two files claiming one name is the ambiguity the old rule tried to resolve with a hash. Six
  names are reserved; anything else is free.
- **The record's shape changes.** → It is rewritten on the next update from what is actually delivered, so a
  store carrying the old `{name: hash}` form converges with no migration and nothing to run.

## Migration Plan

None. The record is rewritten in place on the next `ctxr update`. A store that edited a shipped template has
that edit overwritten; copying it to an unreserved name first preserves it.
