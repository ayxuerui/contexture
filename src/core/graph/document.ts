import path from 'node:path';
import { LINK_EDGE_TYPE, type GraphBuildResult } from './model.js';
import { backlinkCounts, bridges, clusters } from './query.js';

/**
 * graph-context-document spec (D1, D5): the human-readable render of the
 * SAME build that produced graph.json — one derivation, two artifacts, so
 * they can never disagree. Counts but no timestamp, so an unchanged store
 * renders byte-identical output. Links are written as `[[stem]]`, which is
 * what wikilinks resolve on, so the document is navigable inside the store.
 */
export interface GraphDocumentSettings {
  hub_top: number;
  bridge_top: number;
  orphan_exempt_clusters: readonly string[];
}

export interface GraphDocumentSummary {
  notes: number;
  links: number;
  typedLinks: number;
  clusters: number;
  bridges: number;
  orphans: number;
}

function stemOf(id: string): string {
  return path.basename(id, '.md');
}

export function renderGraphDocument(
  graph: GraphBuildResult,
  settings: GraphDocumentSettings,
): { text: string; summary: GraphDocumentSummary } {
  const backlinks = backlinkCounts(graph);
  const clusterList = clusters(graph);
  const bridgeList = bridges(graph, settings.bridge_top);
  const exempt = new Set(settings.orphan_exempt_clusters);

  const hubLines: string[] = [];
  for (const { cluster } of clusterList) {
    const top = graph.nodes
      .filter((n) => n.cluster === cluster && (backlinks.get(n.id) ?? 0) > 0)
      .sort((a, b) => (backlinks.get(b.id) ?? 0) - (backlinks.get(a.id) ?? 0) || a.id.localeCompare(b.id))
      .slice(0, settings.hub_top);
    if (top.length === 0) continue;
    hubLines.push(`### ${cluster}`, '', '| Note | Backlinks |', '|------|-----------|');
    for (const n of top) hubLines.push(`| [[${stemOf(n.id)}]] | ${backlinks.get(n.id)} |`);
    hubLines.push('');
  }

  const bridgeLines = bridgeList.map(
    (b) => `- [[${stemOf(b.id)}]] — ${[b.cluster, ...b.clusters].join(' ⇔ ')} (${b.score} cluster${b.score === 1 ? '' : 's'})`,
  );

  const orphanNodes = graph.nodes
    .filter((n) => (backlinks.get(n.id) ?? 0) === 0 && !exempt.has(n.cluster))
    .sort((a, b) => a.id.localeCompare(b.id));
  const orphanLines = orphanNodes.map((n) => `- [[${stemOf(n.id)}]] — ${n.cluster}`);

  const summary: GraphDocumentSummary = {
    notes: graph.nodes.length,
    links: graph.edges.length,
    typedLinks: graph.edges.filter((e) => e.type !== LINK_EDGE_TYPE).length,
    clusters: clusterList.length,
    bridges: bridgeList.length,
    orphans: orphanNodes.length,
  };

  const lines = [
    '# Graph',
    '',
    '> Derived by `ctxr graph build` from every retrievable note — do not edit; rebuild instead.',
    '> Machine-readable companion: `graph.json`, same build.',
    '',
    `- Notes: ${summary.notes}`,
    `- Links: ${summary.links} (${summary.typedLinks} typed)`,
    `- Clusters: ${summary.clusters}`,
    `- Bridges: ${summary.bridges}`,
    `- Orphans: ${summary.orphans}`,
    '',
    '## Hub notes by cluster',
    '',
    ...(hubLines.length > 0 ? hubLines : ['*(none)*', '']),
    '## Cross-cluster bridges',
    '',
    'Notes that link into the most other clusters:',
    '',
    ...(bridgeLines.length > 0 ? bridgeLines : ['*(none)*']),
    '',
    '## Orphans',
    '',
    'Notes with no incoming links from other notes:',
    '',
    ...(orphanLines.length > 0 ? orphanLines : ['*(none)*']),
  ];
  return { text: `${lines.join('\n')}\n`, summary };
}
