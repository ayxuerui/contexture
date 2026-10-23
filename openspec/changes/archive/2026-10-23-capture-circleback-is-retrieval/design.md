## Decisions

### D1. One capture procedure, with retrieval delegated by family name

Capture's step 1 says to retrieve through a `ctxr-capture-<source>` skill when the store ships one. It uses the
family pattern, not a vendor, so the requirement that the capture skill names no source still holds. Any later
source-specific skill plugs in the same way.

**Case against:** a pattern match is an indirect pointer, and an agent might not connect a source to its skill.
**Why it's enough:**
- The pointer sits in the step every capture starts with.
- The skill's own description names the source.
- A store-level pointer stays possible for a store that wants one.

### D2. The runner still writes the record

Strictly, "retrieval only" would hand the agent the meeting content and leave the record to capture's step 2. But
the agent cannot write it in an unattended run:
- Hermes blocks the agent's Python and heredocs there;
- writing a 50 KB transcript by hand is how the earlier attempts failed.

A verbatim, unedited copy is exactly what step 2 asks for, so the runner does step 2's mechanical part. The agent
does the rest of step 2, reading the record and its speakers, under capture's own rules.

### D3. The name joins the capture family

`ctxr-capture-circleback` sorts beside `ctxr-capture` and states its membership. There is no `ctxr capture` command
group, so the name claims no command. That is the hazard that retired `ctxr-source-capture`, where `ctxr source`
exists.

### D4. A scheduled run stops at review

Capture's step 5 hands off to ingest orchestration, which needs a person. The Circleback skill states that one
exception for scheduled runs, and nothing else differs from capture.
