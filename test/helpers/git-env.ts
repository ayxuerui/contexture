/**
 * Hermetic git environment for tests. Without this, a developer's global
 * `init.defaultBranch=trunk` or `core.hooksPath` can silently change test
 * behavior — and it would definitely break Phase 2's hook tests later.
 */
export function hermeticGitEnv(overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return {
    ...process.env,
    HOME: '/nonexistent-hermetic-home',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
    CONTEXTURE_ROOT: undefined,
    ...overrides,
  };
}
