import type { FetchLike, ForgeCredentials } from './credentials.js';
import { createGhForgeClient, type ForgeClient } from './github.js';
import { createGitLabForgeClient } from './gitlab.js';

/**
 * support-gitlab-as-a-forge D1: the forge client for the repository a
 * credential was resolved for. The credential already says which forge that
 * is — `credentialsFor` read it from the repository's URL — so every command
 * asks here and none chooses a forge itself.
 */
export function forgeClientFor(cwd: string, credentials: ForgeCredentials, fetchImpl?: FetchLike): ForgeClient {
  return credentials.gitlab === undefined ? createGhForgeClient(cwd, credentials) : createGitLabForgeClient(credentials, fetchImpl);
}
