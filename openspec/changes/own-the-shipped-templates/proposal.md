## Why

A shipped note template can currently be edited in place: `ctxr update` notices the file no longer matches
its recorded hash, leaves it alone, and reports it as locally modified. That contract was borrowed from
vendored skills, where it is the right answer for a specific reason — contexture may not modify a file it
did not author, so a third-party skill an operator has edited has to be left alone.

A shipped note template is not that file. contexture wrote it, and it is a *starting shape*, not content: a
note cut from it diverges immediately and is supposed to. So the case the contract protects — an operator's
work being overwritten — does not arise, because there is no work in the template that is not either
contexture's or better expressed as a store's own kind under its own name.

What the contract does produce is a store that silently stops receiving improvements to a template it once
touched, and a `doctor` finding it learns to ignore. That is the familiar failure of an override mechanism
nobody asked for: it converts every future fix into a divergence report.

## What Changes

- **A shipped template is contexture's, unconditionally.** `ctxr update` rewrites any template the packaged
  library names and the store installs, whether or not it has been edited locally. **BREAKING** for a store
  that has edited one: the edit is overwritten on the next update.
- **The `templates.locally_modified` finding is removed**, along with the branch that produced it.
- **The record stops carrying hashes.** Its only remaining job is naming what contexture delivered, so a
  template dropped from the library or from the store's declared list can be removed. Byte-stability comes
  from comparing the file to the bytes it should have, which needs no hash.
- **A store's own kinds keep working, under their own names.** A file at the templates path whose name the
  packaged library does not use is never read, rewritten, or removed. That is the supported way to have a
  house variant, and it is now the only one.

## Capabilities

### Modified Capabilities

- `harness-portability`: MODIFIED — the record requirement loses the content hash and the
  ownership-by-record rule, keeping only delivery tracking. REMOVED — the preserve-and-report requirement,
  replaced by one stating that a shipped template is refreshed unconditionally.

## Non-goals

- **Changing how a vendored skill behaves.** The preserve-and-report contract stays exactly as it is for
  vendored skills, where the reason for it — not modifying a file contexture did not author — still holds.
  This change is narrow on purpose: the two look alike and are not.
- **Preventing an operator from editing the file.** Enforcement is a gate, not a cage. Nothing stops an edit;
  it simply does not survive the next update, and the store's own-named kinds are where a variant belongs.
- **Removing the record.** A template contexture delivered under a name the library later drops still has to
  be removable, and nothing else remembers it was ever contexture's.
- **A per-template opt-out.** That is the override mechanism this change deletes, wearing a different name.

## Impact

**BREAKING for a store that has edited a shipped template** — the edit is overwritten on the next
`ctxr update`, where previously it survived and was reported. No store on this machine has one: the origin
store took the shipped set unmodified in its migration.

**Removed** — a finding code, a sha256 helper, and both sides of the modified/unmodified branch in the sync.

**Touched** — `src/core/note-templates.ts` and its tests; the record's on-disk shape changes from
`{name: hash}` to a list of names, which a store re-derives on its next update.
