import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { StoreConfig } from '../config/schema.js';
import { IdentityEntryMatchError } from './errors.js';
import { writeFileAtomic } from './fs/atomic.js';

/**
 * agent-identity spec: three canonical, harness-neutral roles — posture,
 * durable world facts, durable user facts — kept distinct from retrievable
 * knowledge (excluded from every retrieval leg via each resolved path being
 * covered by config.retrieval.exclude_paths). A harness's own
 * identity-injection adapter decides how these reach a running agent; core
 * never reads their content itself.
 *
 * session-capture-command spec (D3): a role's path is CONFIGURABLE
 * (`identity.files`) — a store whose runtime keeps its memory elsewhere
 * points the role there, and every consumer below resolves through
 * `identityFilePath`/`identityFilePaths` rather than assuming the canonical
 * layout, so the relocated file IS the mechanism, not a copy of it.
 */
export const IDENTITY_ROLES = ['posture', 'world-facts', 'user-facts'] as const;
export type IdentityRole = (typeof IDENTITY_ROLES)[number];

/** The canonical filename each role resolves to under `identity.path` when no override is configured. */
export const IDENTITY_FILES: Record<IdentityRole, string> = {
  posture: 'posture.md',
  'world-facts': 'world-facts.md',
  'user-facts': 'user-facts.md',
};

const TEMPLATES: Record<IdentityRole, string> = {
  posture: '# Agent posture\n\nHow an agent should approach work in this store: tone, defaults, things to always or never do.\n',
  'world-facts': '# Durable world facts\n\nFacts about the world (not the user) worth carrying into every session.\n',
  'user-facts': '# Durable user facts\n\nFacts about the user worth carrying into every session.\n',
};

/** The store-relative path this role resolves to: its configured binding, or its canonical file under `identity.path`. */
export function identityFilePath(config: StoreConfig, role: IdentityRole): string {
  const bound = config.identity.files[role];
  const relative = bound ?? path.join(config.identity.path, IDENTITY_FILES[role]);
  return relative.split(path.sep).join('/');
}

export function identityFilePaths(config: StoreConfig): string[] {
  return IDENTITY_ROLES.map((role) => identityFilePath(config, role));
}

/** Creates any of the three canonical identity files that don't exist yet — never overwrites an existing one. */
export async function ensureIdentityFiles(root: string, config: StoreConfig): Promise<string[]> {
  const created: string[] = [];
  for (const role of IDENTITY_ROLES) {
    const relativePath = identityFilePath(config, role);
    const absolutePath = path.join(root, relativePath);
    if (!existsSync(absolutePath)) {
      await mkdir(path.dirname(absolutePath), { recursive: true });
      await writeFileAtomic(absolutePath, TEMPLATES[role]);
      created.push(relativePath);
    }
  }
  return created;
}

/**
 * session-capture-command spec (D4): an entry is the text between two
 * delimiter lines. The default delimiter ('') means an empty (blank) line,
 * so paragraphs are entries and a heading-sectioned file's headings simply
 * become part of the entry that follows them — no section vocabulary, no
 * format detection.
 */
export function splitEntries(text: string, delimiter: string): string[] {
  const isDelimiterLine = (line: string): boolean => (delimiter === '' ? line.trim() === '' : line === delimiter);
  const entries: string[] = [];
  let current: string[] = [];
  // A single trailing newline is a file-formatting convention, not a blank final line — for a
  // custom delimiter it would otherwise leak into the last entry as trailing junk.
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  for (const line of trimmed.split('\n')) {
    if (isDelimiterLine(line)) {
      if (current.length > 0) {
        entries.push(current.join('\n'));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) entries.push(current.join('\n'));
  return entries;
}

export function joinEntries(entries: readonly string[], delimiter: string): string {
  if (entries.length === 0) return '';
  const separator = delimiter === '' ? '\n\n' : `\n${delimiter}\n`;
  return `${entries.join(separator)}\n`;
}

async function readEntries(absolutePath: string, delimiter: string): Promise<string[]> {
  let text: string;
  try {
    text = await readFile(absolutePath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return splitEntries(text, delimiter);
}

function findUniqueMatch(entries: readonly string[], match: string, filePath: string): number {
  const indices = entries.reduce<number[]>((acc, entry, index) => {
    if (entry.includes(match)) acc.push(index);
    return acc;
  }, []);
  if (indices.length !== 1) {
    throw new IdentityEntryMatchError(filePath, match, indices.length);
  }
  return indices[0]!;
}

export interface IdentityEntryResult {
  /** The role's resolved, store-relative path. */
  path: string;
  /** The entry count after the edit. */
  entries: number;
}

/** Appends a new entry at the end of the role's file, creating it (with no other entries) if it doesn't exist yet. */
export async function addIdentityEntry(root: string, config: StoreConfig, role: IdentityRole, text: string): Promise<IdentityEntryResult> {
  const relativePath = identityFilePath(config, role);
  const absolutePath = path.join(root, relativePath);
  const entries = await readEntries(absolutePath, config.identity.entry_delimiter);
  entries.push(text);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFileAtomic(absolutePath, joinEntries(entries, config.identity.entry_delimiter));
  return { path: relativePath, entries: entries.length };
}

/** Replaces the single entry containing `match`; refuses, writing nothing, when zero or several entries match. */
export async function replaceIdentityEntry(
  root: string,
  config: StoreConfig,
  role: IdentityRole,
  match: string,
  text: string,
): Promise<IdentityEntryResult> {
  const relativePath = identityFilePath(config, role);
  const absolutePath = path.join(root, relativePath);
  const entries = await readEntries(absolutePath, config.identity.entry_delimiter);
  const index = findUniqueMatch(entries, match, relativePath);
  entries[index] = text;
  await writeFileAtomic(absolutePath, joinEntries(entries, config.identity.entry_delimiter));
  return { path: relativePath, entries: entries.length };
}

/** Removes the single entry containing `match`; refuses, writing nothing, when zero or several entries match. */
export async function removeIdentityEntry(
  root: string,
  config: StoreConfig,
  role: IdentityRole,
  match: string,
): Promise<IdentityEntryResult> {
  const relativePath = identityFilePath(config, role);
  const absolutePath = path.join(root, relativePath);
  const entries = await readEntries(absolutePath, config.identity.entry_delimiter);
  const index = findUniqueMatch(entries, match, relativePath);
  entries.splice(index, 1);
  await writeFileAtomic(absolutePath, joinEntries(entries, config.identity.entry_delimiter));
  return { path: relativePath, entries: entries.length };
}
