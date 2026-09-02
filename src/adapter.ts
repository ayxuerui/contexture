/**
 * Public subpath for third-party adapters. Exposes the shared contract
 * every adapter kind implements (adapters spec) — `defineAdapter()` is a
 * type-checking identity function, the same role `defineCheck()` plays for
 * checks, so a third party gets a compile-time guarantee its object shape
 * matches what contexture's registry expects.
 *
 * v1 resolves `contexture.yaml`'s declared adapters against contexture's
 * own built-in registry only (AdapterDeclaration.module is reserved for a
 * future dynamic-loading path) — this subpath exists now so a third-party
 * adapter authored against these types compiles against the same contract
 * contexture's built-ins use, ready for that loading mechanism once it ships.
 */
export type { Adapter, AdapterKind, HarnessGenerationAdapter } from './adapters/types.js';

import type { Adapter, AdapterKind } from './adapters/types.js';

export function defineAdapter<K extends AdapterKind, A extends Adapter<K>>(adapter: A): A {
  return adapter;
}
