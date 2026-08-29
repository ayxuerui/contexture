import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * agent-identity spec: three canonical, harness-neutral files — posture,
 * durable world facts, durable user facts — kept distinct from retrievable
 * knowledge (excluded from every retrieval leg via config.identity.path
 * being a member of config.retrieval.exclude_paths). A harness's own
 * identity-injection adapter decides how these reach a running agent; core
 * never reads their content itself.
 */
export const IDENTITY_FILES = ['posture.md', 'world-facts.md', 'user-facts.md'] as const;

const TEMPLATES: Record<(typeof IDENTITY_FILES)[number], string> = {
  'posture.md': '# Agent posture\n\nHow an agent should approach work in this store: tone, defaults, things to always or never do.\n',
  'world-facts.md': '# Durable world facts\n\nFacts about the world (not the user) worth carrying into every session.\n',
  'user-facts.md': '# Durable user facts\n\nFacts about the user worth carrying into every session.\n',
};

export function identityFilePaths(config: StoreConfig): string[] {
  return IDENTITY_FILES.map((name) => path.join(config.identity.path, name).split(path.sep).join('/'));
}

/** Creates any of the three canonical identity files that don't exist yet — never overwrites an existing one. */
export async function ensureIdentityFiles(root: string, config: StoreConfig): Promise<string[]> {
  const created: string[] = [];
  for (const name of IDENTITY_FILES) {
    const relativePath = path.join(config.identity.path, name).split(path.sep).join('/');
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFileAtomic(absolutePath, TEMPLATES[name]);
      created.push(relativePath);
    }
  }
  return created;
}
