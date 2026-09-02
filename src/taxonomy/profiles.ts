/**
 * store-lifecycle spec: "contexture ships multiple named taxonomy profiles,
 * with PARA as the default." This module is the ONLY place in the entire
 * codebase where a shipped profile's layer names may appear — enforced by
 * test/unit/single-source-literals.test.ts, which scans src/** for these
 * literals outside this one file. Every other module treats the taxonomy as
 * whatever contexture.yaml declares (store-lifecycle: "no component
 * hardcodes a taxonomy or field name").
 *
 * The three profiles were chosen for structurally distinct shapes — layered
 * and task-oriented (PARA), zero layers relying entirely on links
 * (Zettelkasten), layered but documentation-shaped (Diátaxis) — not for
 * popularity. That spread is what proves the taxonomy-from-config mechanism
 * actually generalizes rather than merely asserting it does.
 */
export interface TaxonomyLayer {
  name: string;
  path: string;
  description: string;
}

export interface TaxonomyProfile {
  id: string;
  name: string;
  description: string;
  layers: readonly TaxonomyLayer[];
  /**
   * context-organize spec: where this profile's retired notes belong, when
   * the profile has an opinion. Only a profile whose layers already include
   * a retirement layer declares one — PARA's Archives; Zettelkasten has no
   * layers at all and Diataxis's four are all live documentation, so both
   * leave it unset and fall back to `DEFAULT_ARCHIVE_DESTINATION`. Declared
   * here rather than derived at the archive command, because this module is
   * the only place a shipped layer name may appear (see the header note) —
   * `archive` stays taxonomy-agnostic and reads `organize.archive_destination`.
   */
  archiveDestination?: string;
}

export const SHIPPED_PROFILES: readonly TaxonomyProfile[] = [
  {
    id: 'para',
    name: 'PARA',
    description:
      'Layers Projects, Areas, Resources, Archives; suited to a personal or team ' +
      'knowledge base organized around ongoing responsibilities and active work.',
    layers: [
      { name: 'Projects', path: 'projects', description: 'Active work with a defined end state.' },
      { name: 'Areas', path: 'areas', description: 'Ongoing responsibilities with a standard to maintain.' },
      { name: 'Resources', path: 'resources', description: 'Topic libraries and reference material.' },
      { name: 'Archives', path: 'archives', description: 'Completed, abandoned, or inactive items.' },
    ],
    archiveDestination: 'archives/',
  },
  {
    id: 'zettelkasten',
    name: 'Zettelkasten',
    description:
      'No top-level layers; suited to a store whose structure should emerge ' +
      'entirely from links between notes rather than from folders.',
    layers: [],
  },
  {
    id: 'diataxis',
    name: 'Diátaxis',
    description:
      'Layers Tutorials, How-to guides, Reference, Explanation; suited to a ' +
      'store whose content is documentation.',
    layers: [
      { name: 'Tutorials', path: 'tutorials', description: 'Learning-oriented lessons.' },
      { name: 'How-to guides', path: 'how-to-guides', description: 'Goal-oriented directions.' },
      { name: 'Reference', path: 'reference', description: 'Information-oriented technical description.' },
      { name: 'Explanation', path: 'explanation', description: 'Understanding-oriented discussion.' },
    ],
  },
];

export const DEFAULT_PROFILE_ID = 'para';

export function profileById(id: string): TaxonomyProfile | undefined {
  return SHIPPED_PROFILES.find((p) => p.id === id);
}

export function defaultProfile(): TaxonomyProfile {
  const profile = profileById(DEFAULT_PROFILE_ID);
  if (!profile) {
    throw new Error(`Internal error: DEFAULT_PROFILE_ID "${DEFAULT_PROFILE_ID}" matches no shipped profile.`);
  }
  return profile;
}
