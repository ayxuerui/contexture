import { StoreConfigSchema } from '../../config/schema.js';
import { parse as parseYaml } from 'yaml';
import { configureHooksPath, detectStaleHooks, getConfiguredHooksPath, installHooks } from '../hooks.js';
import { parseNoteText } from '../notes/parse.js';
import { scanForSecrets } from '../security/secrets.js';
import { validateFenceIntegrity } from '../fs/fenced-region.js';
import { sanctionedPath } from '../write-lifecycle/path-gate.js';
import { shippedSkillFiles } from '../skills.js';
import { PUBLISH_INDEX_FILE } from '../browse/routes.js';
import { sendCopyExtension, sendCopyNameProblem } from '../publish/send-copies.js';
import { existsSync } from 'node:fs';
import path from 'node:path';
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

/**
 * exempt-shipped-skill-files-from-the-diff-ceiling: the ceiling bounds what an
 * agent can stage unreviewed, and contexture's own writes are not that — a fresh
 * `init` stages every owned and vendored skill in one commit. A staged file is
 * left out of the count when its staged content is byte-identical to what the
 * installed version ships for its path. Identity, not location: a file that
 * differs by one byte, one that is not shipped, and every deletion count in full.
 */
export const stagedDiffSizeCeilingCheck = defineCheck({
  id: 'staged.diff_size_ceiling',
  title: 'Total staged diff size is under the configured ceiling',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const shipped = await shippedSkillFiles(ctx.config);
    let total = 0;
    let leftOut = 0;
    for (const file of ctx.staged ?? []) {
      const lines = (file.addedLines ?? 0) + (file.removedLines ?? 0);
      if (file.status !== 'D' && file.content !== undefined && shipped.get(file.path) === file.content) leftOut += lines;
      else total += lines;
    }
    const ceiling = ctx.config.write_lifecycle.diff_size_ceiling_lines;
    if (total > ceiling) {
      const note = leftOut > 0 ? ` (${leftOut} more changed lines are skill files identical to what this version ships, and are not counted)` : '';
      return {
        status: 'fail',
        findings: [
          {
            code: 'staged.diff_size_ceiling.exceeded',
            severity: 'error',
            message: `Staged changes total ${total} changed lines, exceeding the configured ceiling of ${ceiling}${note}.`,
            details: { total, ceiling, left_out: leftOut },
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

/**
 * send-copies-gated-at-commit: the send-copy rule, refused at commit in every
 * store — the one gate contexture installs in all of them (D1). A send copy is
 * a send-copy-format file directly in a page folder, judged in the tree this
 * commit produces (D3). Adding one needs a dated name; changing one already
 * committed — in place, or as a rename that changed its bytes (D2) — is
 * refused, because the earlier file may be what a recipient holds. A pure
 * move and a deletion pass: a store reorganising or removing pages takes its
 * send copies with it.
 */
export const stagedSendCopiesCheck = defineCheck({
  id: 'staged.send_copies',
  title: 'No staged send copy is undated, and no committed send copy is changed',
  severity: 'invariant',
  capability: 'write-lifecycle',
  scopes: ['staged'],
  async run(ctx) {
    const staged = ctx.staged ?? [];
    const prefix = `${ctx.config.publish.path.replace(/\\/g, '/').replace(/\/+$/, '')}/`;
    const stagedStatus = new Map(staged.map((file) => [file.path, file.status]));
    const isPageFolder = (folder: string): boolean => {
      const index = `${folder}/${PUBLISH_INDEX_FILE}`;
      const status = stagedStatus.get(index);
      if (status !== undefined) return status !== 'D';
      return existsSync(path.join(ctx.storeRoot, ...index.split('/')));
    };
    const findings: Finding[] = [];
    for (const file of staged) {
      if (file.status === 'D' || !file.path.startsWith(prefix) || sendCopyExtension(file.path) === null) continue;
      if (!isPageFolder(path.posix.dirname(file.path))) continue;
      const changed = file.status === 'M' || (file.status === 'R' && (file.renameScore ?? 0) < 100);
      if (changed) {
        findings.push({
          code: 'staged.send_copies.modified',
          severity: 'error',
          message: `"${file.path}" is a send copy already committed, and this commit changes it. Write the new send as a new dated file and leave this one as it was sent.`,
          subject: file.path,
        });
        continue;
      }
      const problem = sendCopyNameProblem(path.posix.basename(file.path));
      if (problem !== null) {
        findings.push({
          code: 'staged.send_copies.undated',
          severity: 'error',
          message: `"${file.path}" is a send copy: ${problem}. Name it "<YYYY-MM-DD>-<name>.<extension>", led by the date it was made.`,
          subject: file.path,
        });
      }
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
  stagedSendCopiesCheck,
  hooksHealthCheck,
];
