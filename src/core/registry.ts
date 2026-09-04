import { CLI_PACKAGE_NAME } from '../version.js';

/**
 * The ONLY outbound network call in src/. Everything else in this codebase is
 * offline by construction, and the release check is the single, argued
 * exception (keep-the-installed-cli-current, design.md D1/D2).
 *
 * It is an injected port on RunEnv rather than a bare `fetch` in the command
 * for the same reason GitRunner and Prompter are: tests supply a fake and get
 * real command behavior with no HTTP interception anywhere, and the count of
 * network-capable seams stays greppable at one.
 *
 * The port never throws and never rejects. Its callers run *after* a command
 * has already done its real work — session start has created a worktree by
 * then — and runCommand maps any escaping error to the internal-error code,
 * which would report a failed session that in fact succeeded (design.md D5).
 * Every failure is a value here, not an exception.
 */
export type RegistryLookup =
  | { readonly kind: 'resolved'; readonly version: string }
  | { readonly kind: 'undetermined'; readonly reason: string };

export interface RegistryClient {
  /** Resolves the latest published version of `packageName`. Never throws. */
  latestVersion(packageName: string): Promise<RegistryLookup>;
}

/** Where the published release is resolved from. See design.md D11 for why not `npm view`. */
export const REGISTRY_BASE_URL = 'https://registry.npmjs.org';

/** Bounded so the advisory can never hold up session start for long. */
export const REGISTRY_TIMEOUT_MS = 1500;

export function registryUrlFor(packageName: string, baseUrl = REGISTRY_BASE_URL): string {
  // The per-version endpoint returns one small document rather than the full
  // packument, which for a package with many releases is orders of magnitude
  // larger for the same one field.
  return `${baseUrl}/${encodeURIComponent(packageName)}/latest`;
}

function reasonFor(err: unknown): string {
  if (err instanceof Error) {
    // AbortSignal.timeout() rejects with a TimeoutError; name it plainly
    // rather than surfacing "The operation was aborted".
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return `the registry did not answer within ${REGISTRY_TIMEOUT_MS}ms`;
    }
    return err.message;
  }
  return String(err);
}

/**
 * fetch and AbortSignal.timeout are both platform globals at the declared
 * minimum Node version (engines.node >= 22.13), so this adds no dependency.
 */
export function createFetchRegistryClient(
  baseUrl = REGISTRY_BASE_URL,
  timeoutMs = REGISTRY_TIMEOUT_MS,
): RegistryClient {
  return {
    async latestVersion(packageName) {
      try {
        const response = await fetch(registryUrlFor(packageName, baseUrl), {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { accept: 'application/json' },
        });
        if (!response.ok) {
          return { kind: 'undetermined', reason: `the registry answered ${response.status}` };
        }
        const body: unknown = await response.json();
        const version = (body as { version?: unknown } | null)?.version;
        if (typeof version !== 'string' || version.length === 0) {
          return { kind: 'undetermined', reason: 'the registry answer carried no version' };
        }
        return { kind: 'resolved', version };
      } catch (err) {
        return { kind: 'undetermined', reason: reasonFor(err) };
      }
    },
  };
}

/** The package whose releases this executable's own update check follows. */
export function ownPackageName(): string {
  return CLI_PACKAGE_NAME;
}
