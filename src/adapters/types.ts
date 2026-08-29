/**
 * Reserved shape for the adapters capability's single contract, covering the
 * three v1 kinds — harness-generation, identity-injection, forge (a search
 * kind is deferred to v2 alongside the visibility-field naming decision).
 *
 * Phase 2.5 ships a concrete GitHub forge adapter six phases before Phase 8.2
 * formally defines discovery. Reserving this shape now means Phase 2 builds
 * against it instead of inventing its own registration mechanism, and
 * Phase 8 extends this rather than retrofitting Phase 2's adapter into it.
 */
export type AdapterKind = 'harness-generation' | 'identity-injection' | 'forge';

export interface Adapter<K extends AdapterKind = AdapterKind> {
  kind: K;
  id: string;
  interfaceVersion: number;
}

/**
 * adapters spec: "incompatible adapter versions are refused, not silently
 * run." One number per kind, in one place — the same discipline as every
 * other "exactly one place" constant in this codebase. Bumping one of
 * these is a deliberate, breaking change to that kind's interface.
 */
export const SUPPORTED_ADAPTER_INTERFACE_VERSION: Record<AdapterKind, number> = {
  'harness-generation': 1,
  'identity-injection': 1,
  forge: 1,
};

/**
 * A harness-generation adapter produces one harness-specific entry file
 * containing nothing beyond an import of AGENTS.md plus that harness's own
 * extras (harness-portability spec). `render()` returns exactly the lines
 * placed inside contexture's managed fenced region in that file — never the
 * whole file, so a hand-authored preamble outside the fence survives.
 */
export interface GeneratedSkillFile {
  /** Path relative to the store root (e.g. ".claude/skills/contexture-placement/SKILL.md"). */
  path: string;
  content: string;
}

export interface HarnessGenerationAdapter extends Adapter<'harness-generation'> {
  /** The harness-specific file this adapter writes, relative to the store root (e.g. "CLAUDE.md"). */
  entryFileName: string;
  render(agentsMdPath: string): string[];
  /** Optional: harnesses that support a structured permission config (task 8.4). */
  permissionConfig?: {
    /** Relative to the store root (e.g. ".claude/settings.json"). */
    path: string;
    render(config: { worktreesPath: string }): Record<string, unknown>;
  };
  /**
   * Optional (contexture-home-layout spec): harnesses with native skill
   * auto-discovery get one generated wrapper per canonical procedure —
   * discovery metadata plus a pointer to the procedure file, never a copy
   * of its content.
   */
  renderSkills?(procedures: readonly { name: string; path: string; description: string }[]): GeneratedSkillFile[];
}

/**
 * An identity-injection adapter delivers the store's canonical identity
 * content (agent-identity spec) into a harness's runtime — by reference
 * (an import, a symlink, a config entry), never by copying the canonical
 * files' content into the harness-specific file.
 */
export interface IdentityInjectionAdapter extends Adapter<'identity-injection'> {
  /** The file this adapter writes its injection reference into, relative to the store root. */
  entryFileName: string;
  render(identityFilePaths: readonly string[]): string[];
}

/**
 * Maps each adapter kind to its full, kind-specific interface — so a
 * registry lookup by kind returns something with that kind's real methods
 * (render, isAvailable, ...), not just the three common base fields.
 */
export interface AdapterForKind {
  'harness-generation': HarnessGenerationAdapter;
  'identity-injection': IdentityInjectionAdapter;
  forge: import('./forge/types.js').ForgeAdapter;
}

