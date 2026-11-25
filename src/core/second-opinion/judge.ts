import { ROLES, type Role } from './lineup.js';

/**
 * run-the-second-opinion-from-the-cli: critique validation, ported from the
 * skill's `run.mjs`. A critique is valid, blind (well-formed but citing
 * nothing the plan contains), or failed, with the cause.
 *
 * review-a-plan-in-every-role D2: an answer carries one verdict and a
 * `## Role:` section for each of the four roles. One that lacks a section is
 * failed, naming the role: a skipped role would otherwise read as a clean one.
 */
export type Severity = 'critical' | 'major' | 'minor';

export interface ParsedFinding {
  severity: Severity | null;
  confidence: number | null;
  evidence: string;
  /** The role whose section holds the finding; null for one written outside every role section. */
  role: Role | null;
}

export type CritiqueStatus = 'valid' | 'blind' | 'failed';

export interface Judgement {
  status: CritiqueStatus;
  cause: string | null;
  verdict: string | null;
  findings: ParsedFinding[];
  /** How many findings each role's section holds. */
  findings_by_role: Record<Role, number>;
  veto: boolean;
}

const normalizeWs = (s: string): string => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** Step ids a plan numbers as S1, S2, ... at the start of a line, list item, or heading. */
export function planStepIds(plan: string): Set<string> {
  const ids = new Set<string>();
  for (const m of plan.matchAll(/^[ \t]*(?:[-*][ \t]+|#{1,6}[ \t]+)?\**S(\d+)\b/gm)) ids.add(`S${m[1]}`);
  return ids;
}

const isRole = (name: string): name is Role => (ROLES as readonly string[]).includes(name);

function parseFindings(text: string, role: Role | null): ParsedFinding[] {
  return text
    .split(/^### F\d+\b/m)
    .slice(1)
    .map((block) => {
      // Brackets around the severity are what the contract asks for, and models drop them: accept both.
      const head = /^\s*\[?(critical|major|minor)\]?\s*(?:confidence\s*[=:]\s*([01](?:\.\d+)?))?/i.exec(block);
      return {
        severity: (head?.[1]?.toLowerCase() as Severity | undefined) ?? null,
        confidence: head?.[2] !== undefined ? Number(head[2]) : null,
        evidence: /^Evidence:\s*(.+)$/im.exec(block)?.[1] ?? '',
        role,
      };
    });
}

export function parseCritique(text: string): { verdict: string | null; findings: ParsedFinding[]; roles: Role[] } {
  const verdict = /^## Verdict:\s*(APPROVE_WITH_CHANGES|APPROVE|REJECT)\b/m.exec(text)?.[1] ?? null;
  // A section runs from its `## Role:` heading to the next second-level heading. Models bold the name or change its case: accept both.
  const parts = text.split(/^(?=## )/m);
  const findings: ParsedFinding[] = [];
  const roles: Role[] = [];
  for (const part of parts) {
    const name = /^## Role:\s*\**\s*([A-Za-z]+)/.exec(part)?.[1]?.toLowerCase();
    if (name === undefined || !isRole(name)) {
      findings.push(...parseFindings(part, null));
      continue;
    }
    if (!roles.includes(name)) roles.push(name);
    findings.push(...parseFindings(part, name));
  }
  return { verdict, findings, roles };
}

/** True if a finding's evidence points at something the plan actually contains. */
export function evidenceResolves(evidence: string, plan: string, stepIds: ReadonlySet<string>): boolean {
  for (const m of evidence.matchAll(/\bS(\d+)\b/g)) if (stepIds.has(`S${m[1]}`)) return true;
  const haystack = normalizeWs(plan);
  for (const m of evidence.matchAll(/["“`]([^"”`]{12,})["”`]/g)) if (haystack.includes(normalizeWs(m[1]!))) return true;
  for (const m of evidence.matchAll(/([\w./-]+\.[a-z]{1,6}):\d+/gi)) if (plan.includes(m[1]!)) return true;
  return false;
}

const countByRole = (findings: readonly ParsedFinding[]): Record<Role, number> =>
  Object.fromEntries(ROLES.map((role) => [role, findings.filter((f) => f.role === role).length])) as Record<Role, number>;

export function judgeCritique(text: string, plan: string): Judgement {
  const failed = (cause: string, verdict: string | null, findings: ParsedFinding[]): Judgement => ({ status: 'failed', cause, verdict, findings, findings_by_role: countByRole(findings), veto: false });
  if (!text) return failed('empty output', null, []);
  const { verdict, findings, roles } = parseCritique(text);
  if (!verdict) return failed('output has no "## Verdict:" line', verdict, findings);
  const missing = ROLES.filter((role) => !roles.includes(role));
  if (missing.length > 0) return failed(`output has no "## Role: ${missing[0]}" section${missing.length > 1 ? ` (and ${missing.length - 1} more)` : ''}`, verdict, findings);
  if (verdict !== 'APPROVE' && findings.length === 0) return failed(`${verdict} with no parseable findings`, verdict, findings);
  const stepIds = planStepIds(plan);
  const resolved = findings.filter((f) => evidenceResolves(f.evidence, plan, stepIds));
  // An APPROVE with no findings has nothing to cite and is valid. Findings that exist but resolve to
  // nothing in the plan mean the critic answered without reading it.
  const blind = findings.length > 0 && resolved.length === 0;
  const veto = verdict === 'REJECT' && findings.some((f) => f.severity === 'critical' && resolved.includes(f));
  return { status: blind ? 'blind' : 'valid', cause: blind ? 'no finding cites anything in the plan' : null, verdict, findings, findings_by_role: countByRole(findings), veto };
}
