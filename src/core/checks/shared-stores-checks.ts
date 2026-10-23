import type { Finding } from '../envelope.js';
import { isUnderAnyPrefix } from '../fs/prefix.js';
import { createLinkResolver, extractLinkTargets } from '../graph/model.js';
import { listReadView, mountScopes, SHARED_STORES_DIR } from '../shared-stores.js';
import { declaresSharedStores } from '../shared-stores-location.js';
import type { CheckContext } from './types.js';
import { defineCheck } from './types.js';

function noMountsDeclared(ctx: CheckContext): { applicable: true } | { applicable: false; reason: string } {
  return declaresSharedStores(ctx.config)
    ? { applicable: true }
    : { applicable: false, reason: 'the store declares no shared stores' };
}

/**
 * shared-stores spec: the mounting store never tracks mounted content (D10).
 * The local exclude entry only prevents accidental adds; `git add -f` gets
 * past it. This check is what refuses the commit, through the pre-commit
 * hook's `doctor --staged`, and what reports anything already tracked.
 */
export const sharedStoresUntrackedCheck = defineCheck({
  id: 'shared_stores.untracked',
  title: 'Nothing under shared/ is tracked or staged in the mounting store',
  severity: 'invariant',
  capability: 'shared-stores',
  scopes: ['store', 'staged'],
  appliesTo: noMountsDeclared,
  async run(ctx) {
    let paths: string[];
    if (ctx.scope === 'staged') {
      paths = (ctx.staged ?? []).map((file) => file.path).filter((p) => isUnderAnyPrefix(p, [SHARED_STORES_DIR]));
    } else {
      const listed = await ctx.git.run(['ls-files', '-z', '--', SHARED_STORES_DIR], { cwd: ctx.storeRoot });
      paths = listed.stdout.split('\0').filter((p) => p.length > 0);
    }
    const findings: Finding[] = paths.sort().map((p) => ({
      code: 'shared_stores.tracked_mount_content',
      severity: 'error',
      message: `"${p}" is under ${SHARED_STORES_DIR}/, where mounted stores live; it belongs to its own store's history, never this one's. Unstage it with \`git rm --cached\`.`,
      subject: p,
    }));
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

/**
 * shared-stores spec: a shared note naming a note of the mounting store is
 * reported. Owning-store resolution keeps such a link from resolving, but its
 * text still names a private note to every reader of the shared store. Only a
 * checkout holding both stores can see it, which is why it is this store's
 * lint, not the shared store's.
 */
export const sharedNoteNamesPrivateNoteCheck = defineCheck({
  id: 'shared_stores.shared_note_names_private_note',
  title: 'No mounted note links to a note of this store',
  severity: 'observation',
  capability: 'shared-stores',
  scopes: ['store'],
  appliesTo: noMountsDeclared,
  async run(ctx) {
    const view = await listReadView(ctx.storeRoot, ctx.config);
    const scopes = mountScopes(ctx.config);
    const resolveInView = createLinkResolver(view.notes, scopes);
    const resolveInOwn = createLinkResolver(view.notes.filter((note) => !isUnderAnyPrefix(note.path, scopes)));
    const findings: Finding[] = [];
    for (const note of view.notes) {
      if (!isUnderAnyPrefix(note.path, scopes)) continue;
      for (const target of extractLinkTargets(note.body)) {
        if ('path' in resolveInView(note.path, target)) continue;
        const named = resolveInOwn('', target);
        if (!('path' in named)) continue;
        findings.push({
          code: 'shared_stores.shared_note_names_private_note',
          severity: 'info',
          message: `"${note.path}" links to "${target}", which resolves to nothing in its own store but names this store's "${named.path}". Every reader of that shared store sees the name; remove the link there.`,
          subject: note.path,
          details: { target, names: named.path },
        });
      }
    }
    return { status: findings.length > 0 ? 'fail' : 'pass', findings };
  },
});

export const SHARED_STORES_CHECKS = [sharedStoresUntrackedCheck, sharedNoteNamesPrivateNoteCheck] as const;
