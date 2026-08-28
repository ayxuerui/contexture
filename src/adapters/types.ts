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
