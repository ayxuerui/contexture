import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ALL_CLIS, ROLES } from '../../src/core/second-opinion/lineup.js';
import { critiquePrompt, roleOrder } from '../../src/core/second-opinion/prompts.js';
import { packagedTemplate } from '../../src/core/templates.js';
// @ts-expect-error a plain script with no declaration file
import { findingsByRole, judgePrompt, loadPlans, readJudgement, recall, report, requestsFor, reviewsOf, score, SETUPS } from '../../scripts/eval-second-opinion.mjs';

/**
 * review-a-plan-in-every-role D6 (harness-portability requirement "The
 * repository carries a harness that measures a critique against seeded
 * plans"). The harness itself runs by hand, with a key; these tests cover its
 * prompt assembly and its scoring over recorded answers, with no request.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const roles = [...ROLES];
const deps = { critiquePrompt, roleOrder, roles, template: (name: string) => packagedTemplate('second-opinion', name) };
const plans = loadPlans();
const p1 = plans.find((p: { id: string }) => p.id === 'p1')!;

const finding = (n: number, step: string, text: string): string => `### F${n} [major] confidence=0.8\nEvidence: ${step}\nIssue: ${text}\nChange: fix it.\n`;
const sectioned = (byRole: Record<string, string>): string => `## Verdict: APPROVE_WITH_CHANGES\n\n${roles.map((r) => `## Role: ${r}\n${byRole[r] ?? 'None. Nothing here.'}\n`).join('\n')}\n## Suggested changes\n- None.\n`;

describe('the second-opinion evaluation harness', () => {
  it('every seeded plan has an answer key that names a role and a step of the plan for each defect', () => {
    expect(plans.length).toBeGreaterThanOrEqual(12);
    for (const plan of plans) {
      expect(plan.text, plan.id).toMatch(/^# Plan: /);
      expect(plan.text, plan.id).not.toContain('KEY');
      expect(new Set(plan.defects.map((d: { id: string }) => d.id)).size).toBe(plan.defects.length);
      for (const d of plan.defects) {
        expect(roles, `${plan.id}:${d.id}`).toContain(d.role);
        expect(plan.text, `${plan.id}:${d.id}`).toMatch(new RegExp(`^${d.step}\\. `, 'm'));
      }
      for (const role of roles) expect(plan.defects.some((d: { role: string }) => d.role === role), `${plan.id} plants a defect for ${role}`).toBe(true);
    }
  });

  it('the shipped setup asks exactly what the command asks, and the comparison asks one role at a time', () => {
    const requests = requestsFor([p1], 2, [...ALL_CLIS], SETUPS, deps);
    expect(requests).toHaveLength(2 * ALL_CLIS.length * (1 + roles.length));
    for (const r of requests.filter((x: { setup: string }) => x.setup === 'shipped')) {
      expect(r.prompt).toBe(critiquePrompt(r.critic, p1.text));
      expect(r.role_order).toEqual(roleOrder(p1.text, r.critic));
    }
    for (const r of requests.filter((x: { setup: string }) => x.setup === 'single-role')) {
      const given = [...r.prompt.matchAll(/\n## (architect|skeptic|pragmatist|verifier)\n/g)].map((m) => m[1]);
      expect(given).toEqual([r.role]);
      expect(r.prompt).toContain(packagedTemplate('second-opinion', 'critic-contract').trimEnd());
      expect(r.prompt.endsWith(`PLAN:\n${p1.text}\n`)).toBe(true);
    }
    expect(new Set(requests.map((r: { id: string }) => r.id)).size).toBe(requests.length);
  });

  it('a judge is told neither the setup nor the role of a defect or a finding', () => {
    const answers: Record<string, unknown> = {
      'p1.r1.claude.shipped': { ok: true, role_order: roles, text: sectioned({ skeptic: finding(1, 'S4', 'deletes are missed'), verifier: finding(1, 'S10', 'health is not data') + finding(2, 'S2', 'no source for 40%') }) },
      'p1.r1.claude.single-role.skeptic': { ok: true, role: 'skeptic', text: `## Verdict: REJECT\n\n## Role: skeptic\n${finding(1, 'S4', 'deletes are missed')}` },
    };
    for (const setup of SETUPS) {
      const [review] = reviewsOf([p1], 1, ['claude'], [setup], roles, (id: string) => answers[id] ?? null);
      const jp = judgePrompt(review, roles);
      expect(jp.count).toBe(setup === 'shipped' ? 3 : 1);
      const afterPlan = jp.prompt.slice(jp.prompt.indexOf('KNOWN DEFECTS:'));
      expect(afterPlan).not.toMatch(/architect|skeptic|pragmatist|verifier|shipped|single-role|claude/);
      expect(afterPlan).not.toMatch(/\b[AKPV][12]\b/);
      expect(Object.values(jp.alias).sort()).toEqual(p1.defects.map((d: { id: string }) => d.id).sort());
      expect(jp.prompt).toContain(p1.text);
    }
  });

  it('reads the findings of each role section, and files a single-role answer under the role it was asked for', () => {
    const text = sectioned({ architect: finding(1, 'S9', 'a') + finding(2, 'S11', 'b'), pragmatist: finding(1, 'S3', 'c') });
    const parsed = findingsByRole(text, roles);
    expect(Object.fromEntries(roles.map((r) => [r, parsed[r].length]))).toEqual({ architect: 2, skeptic: 0, pragmatist: 1, verifier: 0 });
    expect(parsed.architect[1]).toContain('Evidence: S11');
    const [review] = reviewsOf([p1], 1, ['gpt'], ['single-role'], roles, (id: string) => (id.endsWith('.verifier') ? { ok: true, role: 'verifier', text: `## Verdict: REJECT\n\n## Role: Skeptic\n${finding(1, 'S10', 'x')}` } : null));
    expect(review.units.verifier).toHaveLength(1);
    expect(review.failed).toBe(3);
  });

  it('scores recorded answers and judgements to a known result', () => {
    // Two critics on p1, the shipped setup. claude finds A1, K1 and V1; gpt finds K1 and P1 and writes one finding outside the key.
    const answers: Record<string, unknown> = {
      'p1.r1.claude.shipped': { ok: true, role_order: roles, output_tokens: 900, ms: 30_000, text: sectioned({ architect: finding(1, 'S9', 'sequences after traffic'), skeptic: finding(1, 'S4', 'deletes are missed'), verifier: finding(1, 'S10', 'health is not data') }) },
      'p1.r1.gpt.shipped': { ok: true, role_order: roles, output_tokens: 500, ms: 20_000, text: sectioned({ architect: finding(1, 'S4', 'deletes are missed'), pragmatist: finding(1, 'S3', 'reinvents pg_upgrade') + finding(2, 'S1', 'announce earlier') }) },
    };
    const reviews = reviewsOf([p1], 1, ['claude', 'gpt'], ['shipped'], roles, (id: string) => answers[id] ?? null);
    const truth: Record<string, Record<string, string[] | string>> = {
      'p1.r1.claude.shipped': { 'architect.1': ['A1'], 'skeptic.1': ['K1'], 'verifier.1': ['V1'] },
      'p1.r1.gpt.shipped': { 'architect.1': ['K1'], 'pragmatist.1': ['P1'], 'pragmatist.2': 'weak' },
    };
    // Three judges answer through the neutral ids; the third disagrees on one finding and is outvoted.
    const judgements = (id: string) => {
      const review = reviews.find((r: { id: string }) => r.id === id)!;
      const jp = judgePrompt(review, roles);
      const neutral = Object.fromEntries(Object.entries(jp.alias).map(([alias, real]) => [real, alias]));
      return [0, 1, 2].map((judge) => {
        const findings = Object.entries(jp.refs).map(([ref, at]) => {
          const t = truth[id]![`${(at as { role: string; n: number }).role}.${(at as { role: string; n: number }).n}`]!;
          if (judge === 2 && id.includes('.gpt.') && ref === 'U1.1') return { ref, match: [], other: 'valid' };
          return Array.isArray(t) ? { ref, match: t.map((d) => neutral[d]), other: null } : { ref, match: [], other: t };
        });
        return readJudgement(JSON.stringify({ findings }), jp)!;
      });
    };
    const scored = score(reviews, roles, judgements);
    expect(recall(p1, scored.filter((r: { critic: string }) => r.critic === 'claude'))).toBe(3 / 8);
    expect(recall(p1, scored.filter((r: { critic: string }) => r.critic === 'gpt'))).toBe(2 / 8);
    expect(recall(p1, scored)).toBe(4 / 8);
    const { lines, data } = report([p1], scored, 1, ['claude', 'gpt'], ['shipped'], roles);
    expect(data.recall).toMatchObject({ 'all critics together': { shipped: 0.5 }, claude: { shipped: 0.375 }, gpt: { shipped: 0.25 } });
    expect(data.findings.shipped).toMatchObject({ per_review: 3, matched: 5 / 6, weak: 1 / 6, wrong: 0 });
    // K1 was filed under architect by gpt: four of five matches sit under the role the defect was planted for.
    expect(data.own_role_share.shipped).toBe(4 / 5);
    expect(data.judge_agreement).toBe(5 / 6);
    expect(lines.join('\n')).toContain('| all critics together | 50.0% |');
  });

  it('a run cut short reports only the plan repetitions that are complete, and says so', () => {
    const good = { ok: true, role_order: roles, text: sectioned({ skeptic: finding(1, 'S4', 'deletes are missed') }) };
    // Repetition 1 has both answers; in repetition 2 one answer failed.
    const answers: Record<string, unknown> = { 'p1.r1.claude.shipped': good, 'p1.r1.gpt.shipped': good, 'p1.r2.claude.shipped': good, 'p1.r2.gpt.shipped': { ok: false, cause: 'limit' } };
    const reviews = reviewsOf([p1], 2, ['claude', 'gpt'], ['shipped'], roles, (id: string) => answers[id] ?? null);
    const judged = (id: string) => [0, 1].map(() => [{ role: 'skeptic', n: 1, match: ['K1'], other: null }]).slice(0, id.includes('.r1.') || id.includes('.claude.') ? 2 : 0);
    const partial = report([p1], score(reviews, roles, judged), 2, ['claude', 'gpt'], ['shipped'], roles);
    expect(partial.data).toMatchObject({ cells_used: 1, cells_excluded: 1, recall: { 'all critics together': { shipped: 1 / 8 } } });
    expect(partial.lines.join('\n')).toMatch(/INCOMPLETE: 1 answers failed and 0 reviews have fewer than two judgements\. 1 of 2 plan repetitions are left out/);
    // With no judgement at all there is nothing to report, and no number is printed.
    const none = report([p1], score(reviews, roles, () => []), 2, ['claude', 'gpt'], ['shipped'], roles);
    expect(none.data.cells_used).toBe(0);
    expect(none.lines.join('\n')).toContain('Nothing to report');
    expect(none.lines.join('\n')).not.toMatch(/\d%/);
  });

  it('an unreadable judgement, or one that skips a finding, is not used', () => {
    const [review] = reviewsOf([p1], 1, ['claude'], ['shipped'], roles, () => ({ ok: true, role_order: roles, text: sectioned({ skeptic: finding(1, 'S4', 'x') + finding(2, 'S11', 'y') }) }));
    const jp = judgePrompt(review, roles);
    expect(readJudgement('not json', jp)).toBeNull();
    expect(readJudgement(JSON.stringify({ findings: [{ ref: 'U2.1', match: [], other: 'weak' }] }), jp)).toBeNull();
    expect(readJudgement(`\`\`\`json\n${JSON.stringify({ findings: [{ ref: 'U2.1', match: ['D1', 'D99'], other: null }, { ref: 'U2.2', match: [], other: 'wrong' }] })}\n\`\`\``, jp)).toEqual([
      { role: 'skeptic', n: 1, match: [jp.alias.D1], other: null },
      { role: 'skeptic', n: 2, match: [], other: 'wrong' },
    ]);
  });

  it('is run by hand: no test starts it, and it reaches the network only through the package', () => {
    const source = readFileSync(path.join(ROOT, 'scripts/eval-second-opinion.mjs'), 'utf8');
    expect(source).not.toMatch(/\bfetch\(/);
    expect(source).not.toMatch(/HTTP-Referer|X-Title|X-OpenRouter-Title|User-Agent/);
    expect(source).toContain("askOpenRouter({ base: openRouterBase(process.env), key: process.env[OPENROUTER_KEY_VARIABLE]");
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
    expect(pkg.scripts['eval:second-opinion']).toBe('npm run build --silent && node scripts/eval-second-opinion.mjs');
    expect(pkg.scripts.test).not.toContain('eval');
  });
});
