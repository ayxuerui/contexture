import type { AdapterDeclaration, StoreConfig } from '../config/schema.js';
import { AdapterNotFoundError, AdapterVersionMismatchError } from '../core/errors.js';
import { BUILTIN_ADAPTERS } from './builtin/index.js';
import { SUPPORTED_ADAPTER_INTERFACE_VERSION, type Adapter, type AdapterForKind, type AdapterKind } from './types.js';

/**
 * adapters spec: "one contract for every adapter kind," discovered via
 * contexture.yaml's declared `adapters` list and resolved against a
 * registry by (kind, id) — defaulting to contexture's own built-ins, with
 * the registry itself as a parameter so it's a pure, injectable function
 * (a fixture registry can exercise the version-mismatch-refusal path
 * without needing a real dynamic-module-loading mechanism, which
 * `AdapterDeclaration.module` reserves in the schema but v1 does not
 * implement — every real entry today must name a built-in adapter).
 */
export function resolveAdapter(declaration: AdapterDeclaration, registry: readonly Adapter[] = BUILTIN_ADAPTERS): Adapter {
  const found = registry.find((a) => a.kind === declaration.kind && a.id === declaration.id);
  if (!found) {
    throw new AdapterNotFoundError(declaration.kind, declaration.id);
  }
  const supported = SUPPORTED_ADAPTER_INTERFACE_VERSION[declaration.kind];
  if (found.interfaceVersion !== supported) {
    throw new AdapterVersionMismatchError(declaration.kind, declaration.id, found.interfaceVersion, supported);
  }
  return found;
}

/** Every adapter of `kind` declared in `config.adapters`, resolved and version-checked. */
export function configuredAdapters<K extends AdapterKind>(
  config: StoreConfig,
  kind: K,
  registry: readonly Adapter[] = BUILTIN_ADAPTERS,
): AdapterForKind[K][] {
  return config.adapters.filter((d) => d.kind === kind).map((d) => resolveAdapter(d, registry) as AdapterForKind[K]);
}
