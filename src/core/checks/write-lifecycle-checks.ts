import { StoreConfigSchema } from '../../config/schema.js';
import { parse as parseYaml } from 'yaml';
import { configureHooksPath, detectStaleHooks, getConfiguredHooksPath, installHooks } from '../hooks.js';
import { parseNoteText } from '../notes/parse.js';
import { scanForSecrets } from '../security/secrets.js';
import { validateFenceIntegrity } from '../fs/fenced-region.js';
import { sanctionedPath } from '../write-lifecycle/path-gate.js';
import { defineCheck } from './types.js';
import type { Finding } from '../envelope.js';

const CONFIG_FILE_NAME = 'contexture.yaml';

/**
 * write-lifecycle spec: pre-commit's five staged checks. Each is severity:
 * invariant, scoped to 'staged' only — none of them run (or affect anything)
 * during a plain `doctor` (store-scope) invocation.
 */
export const stagedSchemaConformanceCheck = defineCheck({
  id: 'staged.schema_conformance',
  title: 'Staged contexture.yaml and note frontmatter parse and validate',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.staged ?? []) {
      if (file.status === 'D' || file.content === undefined) continue;

      if (file.path === CONFIG_FILE_NAME) {
        const result = StoreConfigSchema.safeParse(parseYaml(file.content));
        if (!result.success) {
          findings.push({
            code: 'staged.schema_conformance.invalid_config',
            severity: 'error',
            message: `Staged "${file.path}" fails schema validation: ${result.error.issues
              .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
              .join('; ')}`,
            subject: file.path,
          });
        }
        continue;
      }

      if (file.path.endsWith('.md')) {
        try {
          parseNoteText(file.content, file.path);
        } catch (err) {
          findings.push({
            code: 'staged.schema_conformance.invalid_frontmatter',
            severity: 'error',
            message: err instanceof Error ? err.message : String(err),
            subject: file.path,
          });
        }
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const stagedFenceIntegrityCheck = defineCheck({
  id: 'staged.fence_integrity',
  title: 'Staged files have no unpaired or duplicated generated-region markers',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.staged ?? []) {
      if (file.status === 'D' || file.content === undefined) continue;
      const problems = validateFenceIntegrity(file.content);
      for (const problem of problems) {
        findings.push({
          code: 'staged.fence_integrity.mismatch',
          severity: 'error',
          message: `"${file.path}": ${problem}`,
          subject: file.path,
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const stagedSecretScanCheck = defineCheck({
  id: 'staged.secret_scan',
  title: 'Staged content matches no known secret pattern',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.staged ?? []) {
      if (file.status === 'D' || file.content === undefined) continue;
      for (const match of scanForSecrets(file.content)) {
        findings.push({
          code: 'staged.secret_scan.match',
          severity: 'error',
          message: `"${file.path}:${match.line}" matches the ${match.patternId} secret pattern.`,
          subject: file.path,
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * The concrete, testable interpretation of "path allowlist": a declared
 * derived path must never be committed (context-store spec) — staging one
 * is refused here rather than merely documented as a convention. Every
 * staged markdown path also passes the session-capture-command path gate
 * (D5) — the same `sanctionedPath` function `session capture` applies at
 * write time, so the two can never disagree.
 */
export const stagedPathAllowlistCheck = defineCheck({
  id: 'staged.path_allowlist',
  title: 'No staged file is under a declared derived path, and every staged note passes the path gate',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const findings: Finding[] = [];
    for (const file of ctx.staged ?? []) {
      if (file.status === 'D') continue;
      const underDerived = ctx.config.derived.paths.some((derivedPath) => {
        const normalized = derivedPath.endsWith('/') ? derivedPath : `${derivedPath}/`;
        return file.path.startsWith(normalized);
      });
      if (underDerived) {
        findings.push({
          code: 'staged.path_allowlist.derived_path',
          severity: 'error',
          message: `"${file.path}" is under a declared derived path and must never be committed.`,
          subject: file.path,
        });
        continue;
      }
      if (file.path.endsWith('.md')) {
        const gate = await sanctionedPath(ctx.config, ctx.storeRoot, file.path);
        if (!gate.ok) {
          findings.push({
            code: 'staged.path_allowlist.path_gate',
            severity: 'error',
            message: `"${file.path}" ${gate.reason}.`,
            subject: file.path,
          });
        }
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const stagedDiffSizeCeilingCheck = defineCheck({
  id: 'staged.diff_size_ceiling',
  title: 'Total staged diff size is under the configured ceiling',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const total = (ctx.staged ?? []).reduce(
      (sum, file) => sum + (file.addedLines ?? 0) + (file.removedLines ?? 0),
      0,
    );
    const ceiling = ctx.config.write_lifecycle.diff_size_ceiling_lines;
    if (total > ceiling) {
      return {
        status: 'fail',
        findings: [
          {
            code: 'staged.diff_size_ceiling.exceeded',
            severity: 'error',
            message: `Staged changes total ${total} changed lines, exceeding the configured ceiling of ${ceiling}.`,
            details: { total, ceiling },
          },
        ],
      };
    }
    return { status: 'pass', findings: [] };
  },
});

/**
 * store-scope (not staged): are both hooks present with current content,
 * and is core.hooksPath actually pointed at them? Self-heals by
 * reinstalling on drift — a narrow, documented exception to "doctor only
 * reads" for exactly this git-plumbing self-repair (task 2.4).
 */
export const hooksHealthCheck = defineCheck({
  id: 'git.hooks_health',
  title: 'Version-controlled hooks are installed, current, and wired via core.hooksPath',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['store'],
  async run(ctx) {
    const findings: Finding[] = [];
    const defaultBranch = ctx.config.git.default_branch;

    const stale = await detectStaleHooks(ctx.storeRoot, defaultBranch);
    if (stale.length > 0) {
      await installHooks(ctx.storeRoot, defaultBranch);
      findings.push({
        code: 'git.hooks_health.reinstalled',
        severity: 'warning',
        message: `Reinstalled stale hook(s): ${stale.join(', ')}.`,
        details: { stale },
      });
    }

    const hooksPath = await getConfiguredHooksPath(ctx.git, ctx.storeRoot);
    if (hooksPath !== '.githooks') {
      await configureHooksPath(ctx.git, ctx.storeRoot);
      findings.push({
        code: 'git.hooks_health.path_reconfigured',
        severity: 'warning',
        message: `core.hooksPath was "${hooksPath ?? '(unset)'}"; reconfigured to ".githooks".`,
      });
    }

    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const WRITE_LIFECYCLE_CHECKS = [
  stagedSchemaConformanceCheck,
  stagedFenceIntegrityCheck,
  stagedSecretScanCheck,
  stagedPathAllowlistCheck,
  stagedDiffSizeCeilingCheck,
  hooksHealthCheck,
];
