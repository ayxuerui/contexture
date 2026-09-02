import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  DEFAULT_BASELINE_CONVENTIONS_FILE_NAME,
  DEFAULT_HOUSE_CONVENTIONS_FILE_NAME,
  LEGACY_BASELINE_CONVENTION_FILE_NAME,
} from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import { writeFileAtomic } from './fs/atomic.js';
import { packagedTemplate, substituteBlock } from './templates.js';

/** The header every contexture-owned guidance file carries; the guard on removing one. */
const MANAGED_OWNER_MARKER = '<!-- Owned by contexture —';

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
 * compose-store-guidance-documents: the shipped baseline conventions,
 * rendered from this store's own configuration — never a shipped profile's
 * or one deployment's names. This is what `renderConventionsSection` inlines;
 * it is never composed with anything else. `AGENTS.md`'s "Store
 * conventions" section renders this directly as its first block, ahead of
 * however many operator-authored files the guidance directory holds — the
 * baseline itself is not one of them and has no file there.
 */
export function renderBaselineConventions(config: StoreConfig): string {
  let text = conventionTemplate('baseline-conventions')
    .replaceAll('__VISIBILITY_FIELD__', config.fields.visibility)
    .replaceAll('__DEFAULT_CONTEXT__', config.visibility.default_context)
    .replaceAll('__ARCHIVE_DESTINATION__', config.organize.archive_destination)
    .replaceAll('__DEFAULT_BRANCH__', config.git.default_branch)
    .replaceAll('__WORKTREES_PATH__', config.session.worktrees_path);
  text = substituteBlock(text, '__DIRECTORY_DEFAULTS_TABLE__', directoryDefaultsList(config));
  text = substituteBlock(text, '__HARD_WALLS_LIST__', hardWallsList(config));
  text = substituteBlock(text, '__INTERNAL_AUDIENCES_LIST__', internalAudiencesList(config));
  text = substituteBlock(text, '__RELATION_VOCABULARY__', relationVocabularyLines(config));
  return `${text}\n`;
}

/**
 * The baseline is rendered straight into AGENTS.md by `renderConventionsSection`
 * and is no longer a file in the guidance directory. Its bytes were already
 * committed inside AGENTS.md, so a second tracked copy three directories away
 * bought nothing and cost a diff on every config change — and having one
 * tool-owned file among the operator's own is what made "do not edit this one,
 * edit that one" a footgun in the first place.
 *
 * This removes the copy previous versions wrote, under either of its names, so
 * a store that upgrades does not end up inlining the baseline twice: the
 * guidance directory is scanned wholesale.
 */
export async function removeManagedBaselineFile(root: string, config: StoreConfig): Promise<{ changed: boolean }> {
  const guidanceDir = path.join(root, config.harness.guidance_path);
  let changed = false;
  for (const name of [DEFAULT_BASELINE_CONVENTIONS_FILE_NAME, LEGACY_BASELINE_CONVENTION_FILE_NAME]) {
    if (await removeIfManaged(path.join(guidanceDir, name))) changed = true;
  }
  return { changed };
}

/**
 * Guarded on the managed-owner header the same way `syncShippedSkills` guards
 * its own orphan cleanup: a file an operator happens to have written at either
 * name is never removed, and stays an ordinary convention document they own.
 */
async function removeIfManaged(target: string): Promise<boolean> {
  let existing: string;
  try {
    existing = await readFile(target, 'utf8');
  } catch {
    return false;
  }
  if (!existing.includes(MANAGED_OWNER_MARKER)) return false;
  await rm(target);
  return true;
}

/**
 * This store's own conventions — its house rules — seeded once with heading
 * prompts only, no content contexture would be guessing at, and never touched
 * again once it exists (unlike the baseline file, this one is operator-owned).
 */
export async function seedHouseConventionsFile(root: string, config: StoreConfig): Promise<{ created: boolean }> {
  const target = path.join(root, config.harness.guidance_path, DEFAULT_HOUSE_CONVENTIONS_FILE_NAME);
  try {
    await readFile(target, 'utf8');
    return { created: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
  await mkdir(path.dirname(target), { recursive: true });
  await writeFileAtomic(target, `${conventionTemplate('house-conventions-seed')}\n`);
  return { created: true };
}
