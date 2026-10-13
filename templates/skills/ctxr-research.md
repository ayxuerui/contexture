Research a question against real sources and land what you find in this store. The method is a grounded
adaptation of Stanford's STORM: question the topic from several perspectives, ground each one in sources,
reconcile what they disagree on, and review the result before anyone acts on it. Grounding beats fluency: every
load-bearing claim traces to a source of adequate tier, and a confident sentence with nothing behind it is the
failure this procedure exists to catch.

## When

Use it when the operator asks to research, investigate, compare, or map something and the answer should rest on
outside sources. For a single fact, fetch it and stop. For a question the store already answers, retrieve it
(AGENTS.md's retrieval section) instead.

## 1. Frame

1. **What the store already knows.** First check the harness's connected meeting and note sources for primary
   material on the topic that was never captured, and capture it (`ctxr-capture`): it is the cheapest evidence
   the pass will get. Then retrieve: the catalog section (`ctxr catalog show --section <id>`), the graph around
   the nearest note (`ctxr context gather --seed <path> --hops 2`), and your own search for literals. Read the
   cluster. What is known, and what is missing, decides whether this ends as a new note or an edit.
2. **One scoping question, then commit.** A research question is nearly always under-specified: the lens, the
   depth, where the result goes, the constraints. If it is ambiguous, ask one question with up to four explicit
   options and a stated default, then start. Never make the operator pre-decide six dimensions.

## 2. Perspectives

The quality of research is set by the questions asked, and one viewpoint asks a narrow set. Pick at most three
angles that fit the topic, plus the basic facts. A starter set — swap in others (the regulator, the operator, the
competitor) when the topic calls for them:

- **Practitioner** — what does daily use reveal that theory misses?
- **Academic** — what does the peer-reviewed evidence say, and where does it contradict popular belief?
- **Skeptic** — what is the strongest counterargument, and what do proponents ignore?
- **Economist** — who profits from the current narrative, and what incentives shape it?
- **Historian** — what parallels exist, and how did they play out?

A perspective you name and then cannot source — the fetch failed, the source is paywalled, no primary exists —
is reported as unsourced, and the findings that lean on it are downgraded. A named angle that was never grounded
makes single-source research look multi-perspective.

## 3. Search with what the harness has

Never search with the raw question. Turn each angle's questions into two or three search-box queries: strip the
conversational framing ("how does X compare to Y" becomes `X vs Y benchmark`, `X limitations`), add operators
that favour primary sources (`site:`, `filetype:pdf`, an exact phrase, a year), and run a query two
angles both need once.

Web access differs by harness and by machine — one has a native search tool, another a browser reached through
its own route, another nothing. Use what this harness provides. When the store documents its own browser
routing (a store skill or convention), follow it. When the harness can reach no web source at all, say so and
stop: research filled in from memory is the failure mode, not a fallback.

When a fetch comes back empty: official sites often refuse a plain fetch or build their body with JavaScript —
use a browser, or a static mirror of the same text; a site behind a bot wall that refuses both is a gap to
report, not to work around. Save a raw API or search response to `__SCRATCH_PATH__` before parsing it, and confirm a
surprising result with a second, independent query: a parsed response can look authoritative and be wrong. Keep
the fetched corpus there too, so a follow-up pass re-reads rather than re-fetches.

## 4. Tier the sources

Read in tier order, and never let a lower tier carry a decision alone.

- **Primary** — filings, official documentation, the paper or repository itself, first-party data, named
  on-record statements, preprint servers, structured company and market databases.
- **Secondary** — reputable press and analysts. Weight pure opinion down.
- **Weak** — vendor marketing, content farms, listicles, undated posts, review aggregators, a single social
  post. Signal only.
- **Unreliable** — sources known for fabrication. Dropped.

## 5. Map the contradictions

STORM grounds a claim in sources but never reconciles them. Before synthesizing:

- **Direct contradictions** — record both claims with their dates and tiers. Recency and tier break most ties;
  when they do not, carry the conflict as an open question.
- **Perspective tension** — angles that reached different conclusions. The tension is often the finding.
- **Source bias transfer** — a load-bearing claim resting on a weak, partisan, or vendor source, or an apparent
  consensus whose sources all trace to one origin. Require an independent primary source for anything
  decision-critical; label vendor and partisan sources inline.
- **Over-association** — a claim connecting two facts that no single source connects, or one that traces to no
  source at all. Cut it, or mark it as inferred.
- **The blind spot** — what no perspective and no source addressed. Often the most valuable finding.

## 6. Synthesize

Draft the structure from what you know, then refine it against the sources: knowledge for the shape, evidence for
the content. Resolved tensions become findings; unresolved ones become open questions. Then judge against the
store: what the research confirms, extends, contradicts, or nuances in the notes you read in step 1.

## 7. Review before anyone acts on it

- **Gap pass** — what did the material raise that no angle answered? Those are the open questions.
- **Self-review against step 5** — did synthesis drop an unresolved tension, promote an inferred claim to fact,
  or lean on an unsourced perspective? Re-run the bias and over-association checks on the finished text: writing
  prose invents connective tissue, and a link that felt natural to write is where over-association hides.
- **Score each key finding** by the tier behind it, not its tone, and re-verify, downgrade, or flag the weakest.
- **For findings someone will act on**, or that contradict the store's current view, get a model-diverse review
  (`ctxr-second-opinion`) and treat its dissent as another source, not a vote.

## 8. Land it

When the result belongs in the store, `ctxr-ingest-orchestration` decides how it lands — new note, update,
merge, restructure, or a section — and its thesis-change rule applies when the research overturns an existing
conclusion. `ctxr-placement` chooses the folder and template. Capture a source through `ctxr-capture` when a
decision rests on its content, so the evidence outlives the link; otherwise cite it with its tier and the date
you read it. A chat-only answer says so and files nothing.

Report what the research found, its open questions, and which notes it touched, and record a pass that filed
notes in the store log at `__LOG_PATH__`.
