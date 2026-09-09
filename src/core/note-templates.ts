import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_INSTALLED_TEMPLATES } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import type { Finding } from './envelope.js';
import { writeFileAtomic } from './fs/atomic.js';
import { packagedTemplate } from './templates.js';

/**
 * The note templates a store starts a note from.
 *
 * A template is FIXED content — the same bytes in every store, no substitution —
 * so this module delivers files rather than rendering them. That was a
 * deliberate narrowing: making a template follow a per-store vocabulary bought
 * synchronisation between two things only one of which needed to exist.
 *
 * Ownership follows the NAME, and the record is a list of the names contexture
 * delivered. It cannot be a marker inside the file: a template's bytes are
 * copied into a note, so an "Owned by contexture" comment would appear at the
 * top of every note the store ever writes. This module stays separate from
 * `skills.ts` for that reason — a vendored skill's contract looks alike and is
 * the opposite, preserving an operator's edit because contexture may not modify
 * a file it did not author. It authored every one of these.
 */

/** The record naming what contexture delivered, sibling to the templates it names. */
export const TEMPLATES_RECORD_FILE_NAME = '.ctxr-templates.json';

/**
 * context-store spec: the placeholder vocabulary a template may carry,
 * enumerated here and nowhere else. No command expands one — substitution is
 * the agent's, as it starts the note — so this list exists to be CHECKED
 * against, by the lint finding that reports a note which landed with a hole
 * still in it.
 */
export const NOTE_TEMPLATE_PLACEHOLDERS = ['{{title}}', '{{date}}'] as const;

export interface NoteTemplateRecord {
  /**
   * The template names contexture delivered. Not hashes: ownership follows the
   * packaged library's names, and byte-stability is decided by comparing a file
   * to the bytes it should have. The record's only job is remembering that a
   * name was contexture's, so a template the library later drops can still be
   * removed — nothing else remembers that.
   */
  templates: string[];
  ctxrVersion?: string;
}

async function readIfExists(absolutePath: string): Promise<string | undefined> {
  try {
    return await readFile(absolutePath, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * The packaged template, normalized to exactly one trailing newline.
 *
 * Deliberately not a render: a template's content is fixed markdown, including
 * its relation sections. Making those follow a per-store vocabulary was
 * considered and dropped — it bought a configuration surface nobody had asked
 * for, and the cost of the alternative is a heading a store does not use, which
 * is inert. `config` stays in the signature because the sync below is
 * config-scoped and a future template may legitimately need it.
 */
export function renderNoteTemplate(name: string, _config: StoreConfig): string {
  return `${packagedTemplate('notes', name).replace(/\n+$/, '')}\n`;
}

/** Every template name contexture packages, whether or not a store installs it. */
export function packagedTemplateNames(): string[] {
  return [...PACKAGED_TEMPLATE_NAMES];
}

/**
 * The library, enumerated once — the same list `DEFAULT_INSTALLED_TEMPLATES`
 * names, because the shipped default is to install everything packaged. A name
 * a store installs that is NOT here is the store's own file and is never
 * touched; the record is what distinguishes the two.
 */
const PACKAGED_TEMPLATE_NAMES = DEFAULT_INSTALLED_TEMPLATES;

async function readRecord(templatesDir: string): Promise<NoteTemplateRecord | undefined> {
  const raw = await readIfExists(path.join(templatesDir, TEMPLATES_RECORD_FILE_NAME));
  if (raw === undefined) return undefined;
  try {
    const parsed = JSON.parse(raw) as { templates?: unknown; ctxrVersion?: string };
    // own-the-shipped-templates: the previous shape was `{name: hash}`. Read the
    // names out of either form so a store converges on its next update with
    // nothing to run.
    const names = Array.isArray(parsed.templates)
      ? parsed.templates.filter((n): n is string => typeof n === 'string')
      : parsed.templates && typeof parsed.templates === 'object'
        ? Object.keys(parsed.templates as Record<string, unknown>)
        : undefined;
    return names === undefined ? undefined : { templates: names, ctxrVersion: parsed.ctxrVersion };
  } catch {
    return undefined;
  }
}

/**
 * Brings every note template a store declares (`config.templates.installed`) to
 * the packaged version, and removes one it no longer declares.
 *
 * own-the-shipped-templates: ownership follows the NAME. A name the packaged
 * library uses is contexture's and is rewritten unconditionally — a shipped
 * template is a starting shape, not content, so an edit to one is a divergence
 * rather than operator work to preserve. Every other name at the path is the
 * store's own kind and is never read, rewritten, or removed; that is where a
 * house variant belongs.
 */
export async function syncNoteTemplates(
  root: string,
  config: StoreConfig,
  ctxrVersion: string,
): Promise<{ changed: string[]; findings: Finding[] }> {
  const changed: string[] = [];
  const templatesDir = path.join(root, config.templates.path);
  const packaged = new Set<string>(PACKAGED_TEMPLATE_NAMES);
  const wanted = config.templates.installed.filter((name) => packaged.has(name));
  const previous = (await readRecord(templatesDir))?.templates ?? [];
  const delivered: string[] = [];

  function relative(name: string): string {
    return path.join(config.templates.path, `${name}.md`).split(path.sep).join('/');
  }

  for (const name of wanted) {
    const target = path.join(templatesDir, `${name}.md`);
    const rendered = renderNoteTemplate(name, config);
    delivered.push(name);
    // Unconditional: a local edit is a divergence from the shape every store
    // shares, not operator work to preserve. Comparing the bytes is what keeps a
    // second update from writing anything.
    if ((await readIfExists(target)) === rendered) continue;
    await mkdir(templatesDir, { recursive: true });
    await writeFileAtomic(target, rendered);
    changed.push(relative(name));
  }

  // A name the record remembers that the store no longer declares, or that the
  // library no longer carries. Removed whether or not it was edited: an edited
  // copy of a retired template is a file at a contexture-shaped name that
  // contexture no longer explains.
  const keep = new Set(delivered);
  for (const name of previous) {
    if (keep.has(name)) continue;
    const target = path.join(templatesDir, `${name}.md`);
    if ((await readIfExists(target)) === undefined) continue;
    await rm(target, { force: true });
    changed.push(relative(name));
  }

  await writeRecord(templatesDir, config, delivered, ctxrVersion, changed);
  return { changed, findings: [] };
}

/**
 * Byte-stable: the record is rewritten only when its content changes, so a
 * second update in a row writes nothing at all. When nothing is installed and
 * nothing was ever delivered, no record is written and no directory is created —
 * a store that opts out entirely gets no artifact from this at all.
 */
async function writeRecord(
  templatesDir: string,
  config: StoreConfig,
  templates: string[],
  ctxrVersion: string,
  changed: string[],
): Promise<void> {
  const recordPath = path.join(templatesDir, TEMPLATES_RECORD_FILE_NAME);
  const sorted = [...templates].sort((a, b) => a.localeCompare(b));
  const existing = await readIfExists(recordPath);

  if (sorted.length === 0) {
    if (existing !== undefined) {
      await rm(recordPath, { force: true });
      changed.push(path.join(config.templates.path, TEMPLATES_RECORD_FILE_NAME).split(path.sep).join('/'));
      await rmdirIfEmpty(templatesDir);
    }
    return;
  }

  const content = `${JSON.stringify({ templates: sorted, ctxrVersion } satisfies NoteTemplateRecord, null, 2)}\n`;
  if (existing === content) return;
  await mkdir(templatesDir, { recursive: true });
  await writeFileAtomic(recordPath, content);
  changed.push(path.join(config.templates.path, TEMPLATES_RECORD_FILE_NAME).split(path.sep).join('/'));
}

/** Leaves no empty directory behind when a store opts out of every template. */
async function rmdirIfEmpty(dir: string): Promise<void> {
  try {
    if ((await readdir(dir)).length === 0) await rm(dir, { recursive: true, force: true });
  } catch {
    // never existed, or is not ours to remove
  }
}
