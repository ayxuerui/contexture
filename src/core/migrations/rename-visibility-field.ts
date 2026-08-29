import path from 'node:path';
import { DEFAULT_VISIBILITY_FIELD_KEY, SCHEMA_V1_VISIBILITY_FIELD_KEY } from '../../config/defaults.js';
import { readConfig } from '../../config/load.js';
import { renderStoreConfig } from '../../config/render.js';
import { writeFileAtomic } from '../fs/atomic.js';
import { listNotes } from '../notes/list.js';
import { parseNote } from '../notes/parse.js';
import { renderNoteText } from '../notes/render.js';
import type { Store } from '../store.js';
import type { Migration, MigrationDelta } from './types.js';

const OLD_KEY = SCHEMA_V1_VISIBILITY_FIELD_KEY;
const NEW_KEY = DEFAULT_VISIBILITY_FIELD_KEY;

/**
 * store-lifecycle spec (task 9.2): the concrete migration proving the
 * naming-inoculation design holds. The key to search for is the FIXED
 * historical literal (OLD_KEY), never `store.config.fields.visibility` —
 * that field is exactly what apply()'s own last step changes, so deriving
 * "what to look for" from it would make a resumed run, on a store whose
 * config was already bumped but whose notes weren't all done yet,
 * incorrectly treat the (already-correct) new key as something to rename
 * away from. A per-note check is "done" precisely when OLD_KEY is gone
 * from its frontmatter — true whether it was never present or already
 * renamed, which is what makes a re-run naturally skip completed work.
 */
async function pendingNoteRenames(store: Store): Promise<string[]> {
  const notes = await listNotes(store.root, store.config);
  return notes.filter((note) => note.frontmatter?.[OLD_KEY] !== undefined).map((note) => note.path);
}

export const renameVisibilityFieldMigration: Migration = {
  id: '0002-rename-visibility-field-to-lens',
  fromVersion: 1,
  toVersion: 2,
  description: `Rename the visibility frontmatter field from "${OLD_KEY}" to "${NEW_KEY}", on every note and in contexture.yaml.`,

  async plan(store) {
    const deltas: MigrationDelta[] = (await pendingNoteRenames(store)).map((notePath) => ({
      path: notePath,
      description: `rename frontmatter field "${OLD_KEY}" to "${NEW_KEY}"`,
    }));
    if (store.config.fields.visibility !== NEW_KEY || store.config.schema_version < 2) {
      deltas.push({ path: 'contexture.yaml', description: `set fields.visibility to "${NEW_KEY}" and schema_version to 2` });
    }
    return deltas;
  },

  async apply(store) {
    const applied: MigrationDelta[] = [];

    for (const notePath of await pendingNoteRenames(store)) {
      const absolutePath = path.join(store.root, notePath);
      const note = await parseNote(absolutePath, notePath);
      const { [OLD_KEY]: value, ...rest } = note.frontmatter ?? {};
      const frontmatter = { ...rest, [NEW_KEY]: value };
      await writeFileAtomic(absolutePath, renderNoteText(frontmatter, note.body));
      applied.push({ path: notePath, description: `renamed frontmatter field "${OLD_KEY}" to "${NEW_KEY}"` });
    }

    const configPath = path.join(store.root, 'contexture.yaml');
    const currentConfig = await readConfig(store.root);
    if (currentConfig.fields.visibility !== NEW_KEY || currentConfig.schema_version < 2) {
      const nextConfig = { ...currentConfig, fields: { ...currentConfig.fields, visibility: NEW_KEY }, schema_version: 2 };
      await writeFileAtomic(configPath, renderStoreConfig(nextConfig));
      applied.push({ path: 'contexture.yaml', description: `set fields.visibility to "${NEW_KEY}" and schema_version to 2` });
    }

    return applied;
  },
};
