import type { RunEnv } from '../env.js';
import { APP_REPOSITORY_VAR, credentialsFor, ghCredentials, type ForgeCredentials } from '../forge/credentials.js';
import { createGhForgeClient, type ForgeClient } from '../forge/github.js';
import type { ForgeFor } from './session-group.js';

/**
 * approve-sessions-across-stores (proposal Impact): every store a session
 * touches is read and written with the same recording identity — the same
 * credential source, addressed at the mount's own repository through its
 * clone's `origin`. `CONTEXTURE_GITHUB_REPOSITORY` names the home store's
 * repository only, so it is not passed on to a mount.
 *
 * When a command was handed a forge client (a test's), mounts get a plain
 * `gh` client in their own clone, so they are still addressed by their origin.
 */
export function storeForges(env: Pick<RunEnv, 'env' | 'git' | 'now'>, injected?: ForgeClient): ForgeFor {
  const cache = new Map<string, Promise<{ forge: ForgeClient; credentials: ForgeCredentials }>>();
  return (root, mount) => {
    let client = cache.get(root);
    if (client === undefined) {
      client = (async () => {
        if (injected !== undefined) {
          const credentials = ghCredentials(env.env);
          return { forge: createGhForgeClient(root, credentials), credentials };
        }
        const scoped = mount ? { ...env, env: { ...env.env, [APP_REPOSITORY_VAR]: undefined } } : env;
        const credentials = await credentialsFor(scoped, root);
        return { forge: createGhForgeClient(root, credentials), credentials };
      })();
      cache.set(root, client);
      client.catch(() => cache.delete(root));
    }
    return client;
  };
}
