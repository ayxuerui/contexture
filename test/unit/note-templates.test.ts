import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_INSTALLED_TEMPLATES, RELATION_VOCABULARY, SHIPPED_DEFAULTS } from '../../src/config/defaults.js';
import type { StoreConfig } from '../../src/config/schema.js';
import {
  TEMPLATES_RECORD_FILE_NAME,
  renderNoteTemplate,
  syncNoteTemplates,
} from '../../src/core/note-templates.js';
import { packagedTemplate } from '../../src/core/templates.js';
import { makeTmpDir } from '../helpers/tmp-store.js';

const TEMPLATES_PATH = '.contexture/templates/';

function makeConfig(overrides: { installed?: string[] } = {}): StoreConfig {
  return {
    schema_version: 1,
    taxonomy: { profile: 'para', layers: [] },
    derived: { paths: [] },
    retrieval: {
      exclude_paths: [],
      demote_paths: [],
      gather_max_notes: 50,
      graph: { cluster_depth: 2, hub_top: 8, bridge_top: 10, orphan_exempt_clusters: [] },
    },
    git: { default_branch: 'main' },
    session: { branch_prefix: 'session/', worktrees_path: '.worktrees/' },
    write_lifecycle: { diff_size_ceiling_lines: 2000, writable_paths: [] },
    catalog: { path: 'catalog/', section_max_bytes: 32768 },
    publish: { path: 'publish/' },
    templates: { path: TEMPLATES_PATH, installed: overrides.installed ?? [...DEFAULT_INSTALLED_TEMPLATES] },
    skills: { vendored: [] },
    update_check: SHIPPED_DEFAULTS.update_check,
    ingest: { inbox_path: 'raw/inbox/', capture_root: 'raw/', tracking_params: [] },
    organize: { archive_destination: 'archive/', rollup_stale_days: 7 },
    harness: { skills_path: 'skills/', guidance_path: 'guidance/', convention_max_bytes: 32768 },
    adapters: [],
  };
}

function at(root: string, ...rest: string[]): string {
  return path.join(root, TEMPLATES_PATH, ...rest);
}

/**
 * standardize-note-templates: invariants over the PACKAGED files, before any
 * rendering. A template's bytes are copied into a note, so what is in them —
 * and what is not — is the contract.
 */
const NAMES = [...DEFAULT_INSTALLED_TEMPLATES];
const BASE = 'Note';
const PLACEHOLDERS = ['{{title}}', '{{date}}'];

function packaged(name: string): string {
  return packagedTemplate('notes', name);
}

describe('the packaged note-template library', () => {
  it('packages every template the shipped installed list names', () => {
    for (const name of NAMES) {
      expect(() => packaged(name), name).not.toThrow();
    }
  });

  it('names the base first, since every other template builds on it', () => {
    expect(NAMES[0]).toBe(BASE);
  });

  it('gives every template the base frontmatter keys and the base heading', () => {
    for (const name of NAMES) {
      const text = packaged(name);
      expect(text.startsWith('---\n'), name).toBe(true);
      for (const key of ['date_created:', 'title:', 'tags:']) {
        expect(text, `${name} frontmatter`).toContain(key);
      }
      expect(text, `${name} heading`).toContain('# {{title}}');
    }
  });

  it('carries no contexture ownership marker, which would be copied into every note', () => {
    for (const name of NAMES) {
      expect(packaged(name), name).not.toContain('Owned by contexture');
    }
  });

  it('uses only the enumerated placeholder vocabulary', () => {
    for (const name of NAMES) {
      const found = packaged(name).match(/\{\{[^}]*\}\}/g) ?? [];
      for (const token of found) {
        expect(PLACEHOLDERS, `${name} uses ${token}`).toContain(token);
      }
    }
  });

  it('carries the relation sections literally, each with the definition from the constant', () => {
    // Fixed, not rendered — so the definitions are a copy, and this is what stops
    // the copy rotting: every word of each definition must appear under its heading.
    const text = packaged('Concept');
    const lines = text.split('\n');
    for (const relation of RELATION_VOCABULARY) {
      const at = lines.indexOf(`## ${relation.name}`);
      expect(at, relation.name).toBeGreaterThan(-1);
      const comment = lines.slice(at + 1).join(' ');
      const words = relation.definition.replace(/\s+/g, ' ').split(' ');
      for (const word of words) {
        expect(comment.includes(word), `${relation.name}: "${word}" missing from the template comment`).toBe(true);
      }
    }
  });

  it('carries a source section distinguished from the frontmatter ingest writes', () => {
    const text = packaged('Concept');
    expect(text).toContain('## Source');
    expect(text).toContain('`sources:`');
  });

  it('leaves no unsubstituted block placeholder in any packaged template', () => {
    for (const name of NAMES) {
      expect(packaged(name), name).not.toMatch(/^__[A-Z_]+__$/m);
    }
  });

  it('seeds the task format as a comment, never as a live empty checkbox', () => {
    // A bare `- [ ]` in a template is a false open task in every note cut from it.
    for (const name of NAMES) {
      const live = packaged(name)
        .split('\n')
        .filter((line) => /^\s*- \[[ x~]\]/.test(line));
      expect(live, name).toEqual([]);
    }
  });

  it('spells tags as a block sequence or an empty list, never a bare scalar', () => {
    // `tags: Project, StatusNew` is one string, not two tags.
    for (const name of NAMES) {
      const line = packaged(name)
        .split('\n')
        .find((l) => l.startsWith('tags:'));
      expect(line, name).toBeDefined();
      expect(line, name).toMatch(/^tags:( \[\])?$/);
    }
  });

  it('declares no `type` key — the store tags a note, it does not type it', () => {
    for (const name of NAMES) {
      expect(packaged(name).split('\n'), name).not.toContain('type:');
    }
  });
});

describe('renderNoteTemplate', () => {
  it('returns the packaged bytes with exactly one trailing newline', () => {
    const text = renderNoteTemplate('Concept', makeConfig());
    expect(text.endsWith('-->\n')).toBe(true);
    expect(text).toBe(`${packagedTemplate('notes', 'Concept').replace(/\n+$/, '')}\n`);
  });

  it('does not vary with the store configuration', () => {
    // Fixed content: two stores installing the same template get the same bytes.
    expect(renderNoteTemplate('Concept', makeConfig({ installed: ['Concept'] }))).toBe(
      renderNoteTemplate('Concept', makeConfig()),
    );
  });
});

describe('syncNoteTemplates', () => {
  it('writes the declared set and a record naming each one', async () => {
    const tmp = await makeTmpDir();
    try {
      const { changed, findings } = await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(findings).toEqual([]);
      for (const name of DEFAULT_INSTALLED_TEMPLATES) {
        expect(changed).toContain(`${TEMPLATES_PATH}${name}.md`);
      }
      const record = JSON.parse(await readFile(at(tmp.root, TEMPLATES_RECORD_FILE_NAME), 'utf8'));
      expect([...record.templates].sort()).toEqual([...DEFAULT_INSTALLED_TEMPLATES].sort());
      expect(record.ctxrVersion).toBe('0.0.0-test');
    } finally {
      await tmp.cleanup();
    }
  });

  it('writes nothing on a second run with nothing changed', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      const second = await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(second.changed).toEqual([]);
      expect(second.findings).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('rewrites a template whose bytes differ from the packaged version', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      await writeFile(at(tmp.root, 'Concept.md'), '## Concept (stale)\n');

      const { changed } = await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(changed).toContain(`${TEMPLATES_PATH}Concept.md`);
      expect(changed).not.toContain(`${TEMPLATES_PATH}People.md`);
      expect(await readFile(at(tmp.root, 'Concept.md'), 'utf8')).not.toContain('(stale)');
    } finally {
      await tmp.cleanup();
    }
  });

  it('never touches a file under a name the packaged library does not use', async () => {
    const tmp = await makeTmpDir();
    try {
      await mkdir(at(tmp.root), { recursive: true });
      const own = '# a store kind of its own\n';
      await writeFile(at(tmp.root, 'Recipe.md'), own);
      const { changed, findings } = await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(await readFile(at(tmp.root, 'Recipe.md'), 'utf8')).toBe(own);
      expect(changed).not.toContain(`${TEMPLATES_PATH}Recipe.md`);
      expect(findings).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('claims a packaged name even when the store got there first', async () => {
    // Ownership follows the name: two files claiming one name is the ambiguity
    // the old hash rule tried to resolve. A house variant takes another name.
    const tmp = await makeTmpDir();
    try {
      await mkdir(at(tmp.root), { recursive: true });
      await writeFile(at(tmp.root, 'Deal.md'), '# my own Deal shape\n');
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(await readFile(at(tmp.root, 'Deal.md'), 'utf8')).toBe(renderNoteTemplate('Deal', makeConfig()));
    } finally {
      await tmp.cleanup();
    }
  });

  it('delivers a template newly added to the installed list', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig({ installed: ['Note'] }), '0.0.0-test');
      const { changed } = await syncNoteTemplates(tmp.root, makeConfig({ installed: ['Note', 'Project'] }), '0.0.0-test');
      expect(changed).toContain(`${TEMPLATES_PATH}Project.md`);
      expect(changed).not.toContain(`${TEMPLATES_PATH}Note.md`);
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes an unmodified template dropped from the installed list', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      const { changed, findings } = await syncNoteTemplates(tmp.root, makeConfig({ installed: ['Note'] }), '0.0.0-test');
      expect(changed).toContain(`${TEMPLATES_PATH}Deal.md`);
      expect(findings).toEqual([]);
      await expect(readFile(at(tmp.root, 'Deal.md'), 'utf8')).rejects.toThrow();
      await expect(readFile(at(tmp.root, 'Note.md'), 'utf8')).resolves.toContain('# {{title}}');
    } finally {
      await tmp.cleanup();
    }
  });

  it('removes a dropped template even when it was edited', async () => {
    // An edited copy of a template contexture no longer ships is a file at a
    // contexture-shaped name that contexture no longer explains.
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      await writeFile(at(tmp.root, 'Deal.md'), '# edited\n');
      const { findings } = await syncNoteTemplates(tmp.root, makeConfig({ installed: ['Note'] }), '0.0.0-test');
      await expect(readFile(at(tmp.root, 'Deal.md'), 'utf8')).rejects.toThrow();
      expect(findings).toEqual([]);
    } finally {
      await tmp.cleanup();
    }
  });

  it('converges a store carrying the previous {name: hash} record', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      await writeFile(
        at(tmp.root, TEMPLATES_RECORD_FILE_NAME),
        `${JSON.stringify({ templates: { Note: 'deadbeef', Concept: 'cafe' }, ctxrVersion: '0.0.0-old' }, null, 2)}\n`,
      );
      const { findings } = await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      expect(findings).toEqual([]);
      const record = JSON.parse(await readFile(at(tmp.root, TEMPLATES_RECORD_FILE_NAME), 'utf8'));
      expect(Array.isArray(record.templates)).toBe(true);
      expect([...record.templates].sort()).toEqual([...DEFAULT_INSTALLED_TEMPLATES].sort());
    } finally {
      await tmp.cleanup();
    }
  });

  it('opts out entirely on an empty installed list, leaving nothing behind', async () => {
    const tmp = await makeTmpDir();
    try {
      await syncNoteTemplates(tmp.root, makeConfig(), '0.0.0-test');
      await syncNoteTemplates(tmp.root, makeConfig({ installed: [] }), '0.0.0-test');
      await expect(readFile(at(tmp.root, TEMPLATES_RECORD_FILE_NAME), 'utf8')).rejects.toThrow();
      await expect(readFile(at(tmp.root, 'Note.md'), 'utf8')).rejects.toThrow();
    } finally {
      await tmp.cleanup();
    }
  });
});
