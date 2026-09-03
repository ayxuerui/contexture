import type { CommandOutcome, CommandRequires } from '../core/command.js';
import { ExitCode } from '../core/exit-codes.js';
import { readAdmittedGraph } from '../core/graph/persist.js';
import { listNotes } from '../core/notes/list.js';
import { gather, type GatherOptions, type GatherOutcome } from '../core/retrieval/pass.js';
import type { Store } from '../core/store.js';

export const requires: CommandRequires = { store: 'required' };

export interface ContextGatherFlags {
  seed?: string[];
  section?: string[];
  under?: string[];
  entity?: string[];
  hops?: number;
  direction?: 'in' | 'out' | 'both';
  type?: string;
  maxNotes?: number;
}

/**
 * compose-the-retrieval-pass spec: entry selectors in, the graph-expanded
 * neighbourhood out, each note carrying its gloss and the evidence for why it
 * is there. Agent-facing enumeration only — like `rollup gather` and `publish
 * gather`, it finds and orders candidates and never reads or synthesizes them.
 */
export async function execute(store: Store, flags: ContextGatherFlags = {}): Promise<CommandOutcome<GatherOutcome>> {
  const notes = await listNotes(store.root, store.config);
  const graph = await readAdmittedGraph(store);

  const options: GatherOptions = {
    seeds: flags.seed,
    sections: flags.section,
    under: flags.under,
    entities: flags.entity,
    hops: flags.hops,
    direction: flags.direction,
    type: flags.type,
    maxNotes: flags.maxNotes,
  };

  const data = await gather(store, notes, graph, options);
  const truncated = data.budget.truncated ? `, ${data.budget.omitted} omitted by the cap of ${data.budget.maxNotes}` : '';
  return {
    exitCode: ExitCode.Ok,
    data,
    findings: [],
    humanSummary: `${data.budget.returned} note(s) within ${data.hops} hop(s)${truncated}.`,
    storeRoot: store.root,
    schemaVersion: store.config.schema_version,
  };
}
