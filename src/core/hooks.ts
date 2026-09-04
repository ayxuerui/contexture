import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileAtomic } from './fs/atomic.js';
import type { GitRunner } from './git/exec.js';

function templatesDir(): string {
  return fileURLToPath(new URL('../../templates/hooks', import.meta.url));
}

const RESOLVE_PARTIAL_FILE = '_resolve-ctxr.sh';
const RESOLVE_TOKEN = '__RESOLVE_CTXR__';

/**
 * One render path for every shipped hook script. Splices in the shared
 * ctxr-resolution partial first — the resolution ladder is a security
 * decision that must be identical in every hook, so it is authored once
 * (templates/hooks/_resolve-ctxr.sh) and inlined here, never copied into
 * each template — then applies the caller's own literal substitutions. The
 * partial's own trailing newline is dropped so the token's line ending is
 * the only one in the rendered file.
 */
async function renderTemplate(
  templateFileName: string,
  substitutions: Readonly<Record<string, string>> = {},
): Promise<string> {
  let text = await readFile(path.join(templatesDir(), templateFileName), 'utf8');
  if (text.includes(RESOLVE_TOKEN)) {
    const partial = await readFile(path.join(templatesDir(), RESOLVE_PARTIAL_FILE), 'utf8');
    text = text.replaceAll(RESOLVE_TOKEN, partial.replace(/\n$/, ''));
  }
  return Object.entries(substitutions).reduce((acc, [k, v]) => acc.replaceAll(k, v), text);
}

const HOOKS_DIR_NAME = '.githooks';

export interface HookSpec {
  fileName: 'pre-commit' | 'pre-push';
  templateFileName: 'pre-commit.sh' | 'pre-push.sh';
}

const HOOK_SPECS: readonly HookSpec[] = [
  { fileName: 'pre-commit', templateFileName: 'pre-commit.sh' },
  { fileName: 'pre-push', templateFileName: 'pre-push.sh' },
];

async function renderHook(spec: HookSpec, defaultBranch: string): Promise<string> {
  return renderTemplate(spec.templateFileName, { __DEFAULT_BRANCH__: defaultBranch });
}

/**
 * The idempotent render+chmod discipline every generated executable script
 * in this store shares: write only when the rendered content actually
 * differs, so a second run with the same inputs touches neither mtime nor
 * disk. `installHooks` and `installTemplatedHookScript` both funnel through
 * this — one write path, never duplicated.
 */
async function writeRenderedScript(targetPath: string, rendered: string): Promise<boolean> {
  let existing: string | undefined;
  try {
    existing = await readFile(targetPath, 'utf8');
  } catch {
    existing = undefined;
  }
  if (existing === rendered) return false;
  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFileAtomic(targetPath, rendered);
  await chmod(targetPath, 0o755);
  return true;
}

export interface HookInstallResult {
  /** Relative paths (from the store root) of hooks that were written or rewritten. */
  changed: string[];
  hooksDir: string;
}

/**
 * Idempotent: a hook whose rendered content already matches what's on disk
 * is left untouched (no rewrite, no mtime churn), matching every other
 * generated-region writer in the system.
 */
export async function installHooks(root: string, defaultBranch: string): Promise<HookInstallResult> {
  const hooksDir = path.join(root, HOOKS_DIR_NAME);
  await mkdir(hooksDir, { recursive: true });

  const changed: string[] = [];
  for (const spec of HOOK_SPECS) {
    const rendered = await renderHook(spec, defaultBranch);
    const targetPath = path.join(hooksDir, spec.fileName);
    if (await writeRenderedScript(targetPath, rendered)) {
      changed.push(`${HOOKS_DIR_NAME}/${spec.fileName}`);
    }
  }

  return { changed, hooksDir };
}

/**
 * A harness adapter's own generated hook script (e.g. Claude Code's
 * PreToolUse write-gate) — same idempotent render+chmod discipline as git
 * hooks, without assuming the `.githooks` directory. Shares `renderTemplate`
 * with `renderHook`, so it gets the same `__RESOLVE_CTXR__` inlining.
 */
export async function installTemplatedHookScript(
  root: string,
  relativeTargetPath: string,
  templateFileName: string,
): Promise<{ changed: boolean }> {
  const rendered = await renderTemplate(templateFileName);
  const targetPath = path.join(root, relativeTargetPath);
  const changed = await writeRenderedScript(targetPath, rendered);
  return { changed };
}

export async function configureHooksPath(git: GitRunner, cwd: string): Promise<void> {
  await git.run(['config', 'core.hooksPath', HOOKS_DIR_NAME], { cwd });
}

export async function getConfiguredHooksPath(git: GitRunner, cwd: string): Promise<string | undefined> {
  const result = await git.run(['config', 'core.hooksPath'], { cwd, allowFailure: true });
  if (result.exitCode !== 0) return undefined;
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

/**
 * doctor's hook-health check: are both hooks present with up-to-date
 * content? (Whether core.hooksPath actually points at them is a separate,
 * git-config-dependent question — see getConfiguredHooksPath.) Detection
 * only; the check definition (checks/hooks.ts) decides whether to self-heal.
 */
export async function detectStaleHooks(root: string, defaultBranch: string): Promise<string[]> {
  const stale: string[] = [];
  for (const spec of HOOK_SPECS) {
    const rendered = await renderHook(spec, defaultBranch);
    const targetPath = path.join(root, HOOKS_DIR_NAME, spec.fileName);
    let existing: string | undefined;
    try {
      existing = await readFile(targetPath, 'utf8');
    } catch {
      existing = undefined;
    }
    if (existing !== rendered) stale.push(`${HOOKS_DIR_NAME}/${spec.fileName}`);
  }
  return stale;
}
