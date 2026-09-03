## Context

See `proposal.md` — Why, and the `harness-portability` delta under `specs/` for the requirement set.

`retire-the-access-axes` was a large removal, and its own Risks section anticipated leftovers: it enumerated the comment-only references it chose not to chase. What it did not catch is the class where the reference is *instructional* — a shipped skill telling an agent to pass a flag, an error message offering one, and a live spec scenario asserting a gate's behavior. Those are not comments. They are the store's own instructions to the agents that read it, and they are wrong.

## Goals / Non-Goals

**Goals:**
- Make the shipped package's instructions true again, so an agent following an owned skill does not hit a usage error.
- Preserve the invariant the disclosure scenario protected, which outlived the gate that carried it.
- Make this class of defect mechanically detectable rather than found by reading.

**Non-Goals:**
- Deciding anything about future access control.
- Fixing the other stale change (`isolate-the-portability-test`), which needs a design decision rather than a substitution.
- Changing any command's behavior. The only code edit is one error message's text.

## Decisions

### D1 — `openspec/config.yaml` is the artifact that is wrong, not the spec
config.yaml's own rule says that where it and a spec disagree, it wins and the disagreement is a bug. Applied literally that would make `openspec/specs/adapters/spec.md` wrong and require building the seam. But the context contradicts an *archived design decision*, not just a spec: `bootstrap-contexture-core` D5 rejected "build the search-adapter contract now with no concrete adapter shipped," on the grounds that shipping the seam early commits v1 to a contract for a capability whose shape isn't proven. What actually shipped as the forward-compatibility mitigation is the stable per-note retrieval record, which bootstrap's own Risks names. The context sentence is a summary that drifted past its source. **Alternative considered:** leave the context alone and build the seam to make it true — rejected, because it would build the exact thing D5 refused in order to satisfy a summary of D5.

### D2 — The disclosure scenario is rewritten, not deleted
The gate is gone; the invariant it carried is not. "Pitching prose more plainly must never widen what a page may contain" is still true, still worth stating, and still the thing a writer gets wrong — step 3 of the publish skill remains a judgment step about what belongs in front of a page's readers, it is simply no longer a mechanism. **Alternative considered:** delete the scenario along with the gate — rejected, because it would drop a real invariant together with its dead vehicle, and the invariant is the part that was ever load-bearing.

### D3 — The recurrence guard is a flag-existence check, and it is its own requirement
The general defect is "an owned skill names a CLI affordance that does not exist." That is mechanically checkable: extract every long option named alongside a contexture command in each rendered owned skill and resolve it against the CLI's own option table. This converts `harness-portability`'s "SHALL name the command that verifies each step it asks for" from a claim a reviewer must verify by reading into one a test holds, which is what the project's rule that every enforced requirement must name its mechanism asks for. It lands as its own requirement rather than a scenario under the taxonomy requirement, because its subject is fidelity to the CLI, not decision procedures for a taxonomy. **Alternative considered:** grep the templates for the specific retired flag names — rejected, because it catches this removal and no future one; the defect class is not "`--as` survived," it is "a skill drifted from the CLI."

### D4 — The stale scenario keeps its title, and the body carries the correction
`openspec validate --strict` refuses a MODIFIED block that drops or renames any scenario the live spec still has, and refuses REMOVED and ADDED of the same requirement name; RENAMED carries name changes only. So retiring the title "Publish keeps the reader's level distinct from the disclosure audience" would mean renaming its 47-line parent requirement — whose name is accurate — purely to route around a tooling constraint, and `openspec/config.yaml` warns that a name is the most expensive thing to change later. The title keeps a retired word; the assertion underneath it is corrected and now states that there is no gate and no audience selector to name. **Alternative considered:** rename the parent requirement so the scenario could be relabelled — rejected as disproportionate: it would rewrite a correct name and re-anchor eleven unrelated scenarios to remove one stale phrase from a title.

### D5 — This lands before the retrieval work, not with it
It touches a different capability (`harness-portability`), it is a bug fix rather than a design change, and it collides with the retrieval change on exactly one file — `templates/skills/ctxr-connection-finding.md`, which the retrieval change also rewrites. Sequencing the smaller fix first means the larger change rebases onto a correct file instead of preserving an error while restructuring around it. **Alternative considered:** fold it into the retrieval change — rejected, because a shipped skill that documents a nonexistent flag should not wait behind a design argument.

## Risks / Trade-offs

- **[Risk] The flag-existence check could fail on a flag a skill names for a *different* tool** — a skill legitimately mentions `git push --force-with-lease` or `gh pr create --fill`, and neither is a `ctxr` flag. → **Mitigation**: the check resolves only flags appearing on a line that also names a `ctxr` command, which is the same shape the skills already use when they instruct a step; a flag named in prose about another tool is out of its scope by construction.
- **[Trade-off] Rewriting the publish skill's closing paragraph loses the concrete `--audience` example** that made the two senses of "audience" vivid. → Accepted: the distinction it taught was between a disclosure verdict and a comprehension register, and with the verdict gone the remaining hazard is simpler to state directly — writing plainly does not change what belongs on the page.

## Migration Plan

No migration. No configuration key changes, no schema version bump, no note is rewritten. `ctxr update` refreshes the two owned skills the next time it runs; a store that locally modified either keeps its copy and is reported, per the existing "locally modified vendored skill is preserved and reported" discipline applied to owned skills.

## Open Questions

None. The one judgment call — whether to delete or restate the disclosure scenario — is settled in D2, and it does not depend on anything unresolved elsewhere.
