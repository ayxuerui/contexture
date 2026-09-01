import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_BASELINE_CONVENTION_FILE_NAME, DEFAULT_CUSTOM_CONVENTION_FILE_NAME } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import { writeFileAtomic } from './fs/atomic.js';
import { packagedTemplate, substituteBlock } from './templates.js';

function conventionTemplate(name: string): string {
  return packagedTemplate('conventions', name);
}

function directoryDefaultsList(config: StoreConfig): string[] {
  const entries = Object.entries(config.visibility.directory_defaults);
  if (entries.length === 0) {
    return ['- (none configured — every note without an explicit value resolves to the store default context)'];
  }
  return entries.map(([prefix, value]) => `- \`${prefix}\` → \`${value}\``);
}

function hardWallsList(config: StoreConfig): string[] {
  const { hard_walls: hardWalls } = config.disclosure;
  if (hardWalls.length === 0) return ['- (none configured)'];
  return hardWalls.map((wall) => {
    const scope = wall.note_path_prefix ? `under \`${wall.note_path_prefix}\`` : '(every path)';
    const audience = wall.audience === '*' ? 'every audience' : `\`${wall.audience}\``;
    const except = wall.except && wall.except.length > 0 ? `, except ${wall.except.map((a) => `\`${a}\``).join(', ')}` : '';
    return `- ${audience} ${scope} → **${wall.verdict.toUpperCase()}**${except}`;
  });
}

function internalAudiencesList(config: StoreConfig): string[] {
  const { internal_audiences: internalAudiences } = config.disclosure;
  if (internalAudiences.length === 0) return ['- (none configured — every audience is external)'];
  return internalAudiences.map((name) => `- \`${name}\``);
}

function relationVocabularyLines(config: StoreConfig): string[] {
  const { relations } = config.retrieval;
  if (relations.length === 0) {
    return ['This store declares no relation vocabulary (`retrieval.relations`) — every link is untyped.'];
  }
  const named = relations.map((name) => `**${name}**`).join(', ');
  return [
    `This store's configured relation vocabulary, in link-section order: ${named}. A link under one of these section headings in a note's body is typed accordingly; a link under any other heading is untyped.`,
  ];
}

/**
 * compose-store-guidance-documents: the shipped baseline convention,
 * rendered from this store's own configuration — never a shipped profile's
 * or one deployment's names. This is what `syncBaselineConvention` writes;
 * it is never composed with anything else. `AGENTS.md`'s "Store
 * conventions" section (inline-conventions-and-mission's
 * `scanConventions`/`renderConventionsSection`) inlines it as one of
 * however many convention files the guidance directory holds, exactly like
 * any operator-authored one.
 */
export function renderBaselineConvention(config: StoreConfig): string {
  let text = conventionTemplate('baseline-convention')
    .replaceAll('__VISIBILITY_FIELD__', config.fields.visibility)
    .replaceAll('__DEFAULT_CONTEXT__', config.visibility.default_context)
    .replaceAll('__ARCHIVE_PATH__', config.organize.archive_path)
    .replaceAll('__DEFAULT_BRANCH__', config.git.default_branch)
    .replaceAll('__WORKTREES_PATH__', config.session.worktrees_path);
  text = substituteBlock(text, '__DIRECTORY_DEFAULTS_TABLE__', directoryDefaultsList(config));
  text = substituteBlock(text, '__HARD_WALLS_LIST__', hardWallsList(config));
  text = substituteBlock(text, '__INTERNAL_AUDIENCES_LIST__', internalAudiencesList(config));
  text = substituteBlock(text, '__RELATION_VOCABULARY__', relationVocabularyLines(config));
  return `${text}\n`;
}

/**
 * compose-store-guidance-documents: contexture-owned, the same way a
 * shipped skill copy is (`syncShippedSkills` in skills.ts) — written by
 * `ctxr init`, rewritten wholesale by `ctxr update` on drift, never
 * hand-edited. A single file, so this is simpler than the skills sync (no
 * directory scan, no orphan cleanup): read-compare-write, reporting whether
 * it changed.
 */
export async function syncBaselineConvention(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const target = path.join(root, config.harness.guidance_path, DEFAULT_BASELINE_CONVENTION_FILE_NAME);
  const content = renderBaselineConvention(config);
  let existing: string | undefined;
  try {
    existing = await readFile(target, 'utf8');
  } catch {
    existing = undefined;
  }
  if (existing === content) return { changed: false };
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, content);
  return { changed: true };
}

/**
 * The operator's own convention source, seeded once with heading prompts
 * only — no content contexture would be guessing at — and never touched
 * again once it exists (unlike the baseline file, this one is
 * operator-owned).
 */
export async function seedCustomConventionFile(root: string, config: StoreConfig): Promise<{ created: boolean }> {
  const target = path.join(root, config.harness.guidance_path, DEFAULT_CUSTOM_CONVENTION_FILE_NAME);
  try {
    await readFile(target, 'utf8');
    return { created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${conventionTemplate('custom-convention-seed')}\n`);
  return { created: true };
}
