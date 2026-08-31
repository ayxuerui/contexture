/**
 * Marker strings for contexture's generated-region convention (context-store
 * spec: "Marker-fenced generated regions"). Once shipped, marker text is a
 * FOREVER compatibility surface — changing it orphans every existing store's
 * fenced blocks — so it lives in exactly this one file, parameterized by
 * region name, and is never inlined at a call site.
 */
export interface Fence {
  start: string;
  end: string;
}

/** `#`-comment-style fence, used by `.gitignore` in Phase 0. */
export function commentFence(regionName: string): Fence {
  return {
    start: `# >>> contexture:${regionName} (managed — do not edit) >>>`,
    end: `# <<< contexture:${regionName} <<<`,
  };
}

export const DERIVED_GITIGNORE_FENCE: Fence = commentFence('derived');

/** HTML-comment-style fence, used by markdown files (catalog sections, notes) so the markers render sensibly. */
export function htmlCommentFence(regionName: string): Fence {
  return {
    start: `<!-- >>> contexture:${regionName} (managed — do not edit) >>> -->`,
    end: `<!-- <<< contexture:${regionName} <<< -->`,
  };
}

/**
 * A harness-generation adapter's own fenced region within its entry file
 * (`adapters-generate.ts`) — shared with the `adapters.harness_entry_no_duplicate_convention_text`
 * doctor check (`integrity-checks.ts`), which needs the identical fence to
 * find the same boundary from the other side (everything OUTSIDE it).
 */
export function harnessEntryFence(adapterId: string): Fence {
  return htmlCommentFence(`adapter:${adapterId}:harness-entry`);
}
