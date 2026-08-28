/** contexture's library public surface. */
export type { Io, RunEnv } from './core/env.js';
export { realEnv } from './core/env.js';
export type { Envelope, Finding, Status } from './core/envelope.js';
export { ExitCode } from './core/exit-codes.js';
export type { StoreConfig, TaxonomyLayerConfig } from './config/schema.js';
export { StoreConfigSchema, SUPPORTED_SCHEMA_VERSION } from './config/schema.js';
export type { Store } from './core/store.js';
export { openStore } from './core/store.js';
export type { TaxonomyLayer, TaxonomyProfile } from './taxonomy/profiles.js';
export { DEFAULT_PROFILE_ID, SHIPPED_PROFILES, defaultProfile, profileById } from './taxonomy/profiles.js';
export { run } from './run.js';
