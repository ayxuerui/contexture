/**
 * run-the-second-opinion-from-the-cli: critique validation, ported from the
 * skill's `run.mjs` unchanged. A critique is valid, blind (well-formed but
 * citing nothing the plan contains), or failed, with the cause.
 */
export type Severity = 'critical' | 'major' | 'minor';

export interface ParsedFinding {
  severity: Severity | null;
  confidence: number | null;
  evidence: string;
}

export type CritiqueStatus = 'valid' | 'blind' | 'failed';

export interface Judgement {
  status: CritiqueStatus;
  cause: string | null;
  verdict: string | null;
  findings: ParsedFinding[];
  veto: boolean;
}

const normalizeWs = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Step ids a plan numbers as S1, S2, ... at the start of a line, list item, or heading. */
export function planStepIds(plan: string): Set<string> {
  const ids = new Set<string>();
  for (const m of plan.matchAll(/^[ \t]*(?:[-*][ \t]+|#{1,6}[ \t]+)?\**S(\d+)\b/gm)) ids.add(`S${m[1]}`);
  return ids;
}

export function parseCritique(text: string): { verdict: string | null; findings: ParsedFinding[] } {
  const verdict = /^## Verdict:\s*(APPROVE_WITH_CHANGES|APPROVE|REJECT)\b/m.exec(text)?.[1] ?? null;
  const findings: ParsedFinding[] = [];
  const blocks = text.split(/^### F\d+\b/m).slice(1);
  for (const block of blocks) {
    // Brackets around the severity are what the contract asks for, and models drop them: accept both.
    const head = /^\s*\[?(critical|major|minor)\]?\s*(?:confidence\s*[=:]\s*([01](?:\.\d+)?))?/i.exec(block);
    const evidence = /^Evidence:\s*(.+)$/im.exec(block)?.[1] ?? '';
    findings.push({
      severity: (head?.[1]?.toLowerCase() as Severity | undefined) ?? null,
      confidence: head?.[2] !== undefined ? Number(head[2]) : null,
      evidence,
    });
  }
  return { verdict, findings };
}

/** True if a finding's evidence points at something the plan actually contains. */
export function evidenceResolves(evidence: string, plan: string, stepIds: ReadonlySet<string>): boolean {
  for (const m of evidence.matchAll(/\bS(\d+)\b/g)) if (stepIds.has(`S${m[1]}`)) return true;
  const haystack = normalizeWs(plan);
  for (const m of evidence.matchAll(/["“`]([^"”`]{12,})["”`]/g)) if (haystack.includes(normalizeWs(m[1]!))) return true;
  for (const m of evidence.matchAll(/([\w./-]+\.[a-z]{1,6}):\d+/gi)) if (plan.includes(m[1]!)) return true;
  return false;
}

export function judgeCritique(text: string, plan: string): Judgement {
  if (!text) return { status: 'failed', cause: 'empty output', verdict: null, findings: [], veto: false };
  const { verdict, findings } = parseCritique(text);
  if (!verdict) return { status: 'failed', cause: 'output has no "## Verdict:" line', verdict, findings, veto: false };
  if (verdict !== 'APPROVE' && findings.length === 0) return { status: 'failed', cause: `${verdict} with no parseable findings`, verdict, findings, veto: false };
  const stepIds = planStepIds(plan);
  const resolved = findings.filter((f) => evidenceResolves(f.evidence, plan, stepIds));
  // An APPROVE with no findings has nothing to cite and is valid. Findings that exist but resolve to
  // nothing in the plan mean the critic answered without reading it.
  const blind = findings.length > 0 && resolved.length === 0;
  const veto = verdict === 'REJECT' && findings.some((f) => f.severity === 'critical' && resolved.includes(f));
  return { status: blind ? 'blind' : 'valid', cause: blind ? 'no finding cites anything in the plan' : null, verdict, findings, veto };
}
