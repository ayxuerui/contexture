import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_INSTALLED_TEMPLATES } from '../config/defaults.js';
import type { StoreConfig } from '../config/schema.js';
import type { Finding } from './envelope.js';
import { writeFileAtomic } from './fs/atomic.js';
import { packagedTemplate } from './templates.js';

/**
 * standardize-note-templates: the note templates a store starts a note from.
 *
 * Two existing patterns, combined. Rendering follows `convention-doc.ts` — the
 * prose is packaged markdown, substituted against the store's own configuration,
 * so a vocabulary change reaches the templates rather than silently diverging
 * from the graph that reads them. Ownership follows the vendored-skill half of
 * `skills.ts` — a record with a content hash, not a marker in the file.
 *
 * The record, and not an in-file header, is the whole point (design D2): a
 * template's bytes are copied into a note, so an "Owned by contexture" comment
 * would appear at the top of every note the store ever writes. This module is
 * deliberately separate from `skills.ts` for the same reason — the two ownership
 * marks must not be confused.
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
  /** Template name (no extension) -> sha256 of the rendered bytes contexture wrote. */
  templates: Record<string, string>;
  ctxrVersion?: string;
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
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
    const parsed = JSON.parse(raw) as NoteTemplateRecord;
    return parsed.templates && typeof parsed.templates === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Brings every note template a store declares (`config.templates.installed`) to
 * the packaged version rendered for this store, and removes a previously
 * installed template the store no longer wants.
 *
 * The hash in the record decides everything: it matches, so contexture wrote
 * what is on disk and may rewrite it; it does not, so an operator edited the
 * file and it is left exactly as it is with a finding naming it. A file the
 * record does not name is the store's own kind and is never read, rewritten, or
 * removed.
 */
export async function syncNoteTemplates(
  root: string,
  config: StoreConfig,
  ctxrVersion: string,
): Promise<{ changed: string[]; findings: Finding[] }> {
  const changed: string[] = [];
  const findings: Finding[] = [];
  const templatesDir = path.join(root, config.templates.path);
  const packaged = new Set<string>(PACKAGED_TEMPLATE_NAMES);
  const wanted = config.templates.installed.filter((name) => packaged.has(name));
  const previous = (await readRecord(templatesDir))?.templates ?? {};
  const next: Record<string, string> = {};

  function relative(name: string): string {
    return path.join(config.templates.path, `${name}.md`).split(path.sep).join('/');
  }

  for (const name of wanted) {
    const target = path.join(templatesDir, `${name}.md`);
    const onDisk = await readIfExists(target);
    const recorded = previous[name];

    if (onDisk !== undefined && recorded === undefined) {
      // The record never named it, so it is the store's own file at a packaged
      // name. Leave it alone rather than claiming it.
      continue;
    }
    if (onDisk !== undefined && recorded !== undefined && sha256(onDisk) !== recorded) {
      findings.push({
        code: 'templates.locally_modified',
        severity: 'warning',
        message: `"${relative(name)}" has been modified locally — left unchanged rather than refreshed.`,
        subject: name,
      });
      next[name] = recorded;
      continue;
    }

    const rendered = renderNoteTemplate(name, config);
    next[name] = sha256(rendered);
    if (onDisk === rendered) continue;
    await mkdir(templatesDir, { recursive: true });
    await writeFileAtomic(target, rendered);
    changed.push(relative(name));
  }

  // A template the record names that the store no longer installs, or that
  // contexture no longer packages: remove it when unmodified, report it when not.
  for (const [name, recorded] of Object.entries(previous)) {
    if (name in next) continue;
    const target = path.join(templatesDir, `${name}.md`);
    const onDisk = await readIfExists(target);
    if (onDisk === undefined) continue;
    if (sha256(onDisk) !== recorded) {
      findings.push({
        code: 'templates.locally_modified',
        severity: 'warning',
        message: `"${relative(name)}" is no longer installed but has been modified locally — left on disk rather than removed.`,
        subject: name,
      });
      next[name] = recorded;
      continue;
    }
    await rm(target, { force: true });
    changed.push(relative(name));
  }

  await writeRecord(templatesDir, config, next, ctxrVersion, changed);
  return { changed, findings };
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
  templates: Record<string, string>,
  ctxrVersion: string,
  changed: string[],
): Promise<void> {
  const recordPath = path.join(templatesDir, TEMPLATES_RECORD_FILE_NAME);
  const sorted = Object.fromEntries(Object.entries(templates).sort(([a], [b]) => a.localeCompare(b)));
  const existing = await readIfExists(recordPath);

  if (Object.keys(sorted).length === 0) {
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
