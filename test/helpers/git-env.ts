import { DIST_BIN } from './dist-bin.js';

/**
 * Hermetic git environment for tests. Without this, a developer's global
 * `init.defaultBranch=trunk` or `core.hooksPath` can silently change test
 * behavior — and it would definitely break Phase 2's hook tests later.
 *
 * Pins `CONTEXTURE_BIN` to the real built `dist/bin.js`: generated hooks now
 * resolve `ctxr` at run time (CONTEXTURE_BIN, then PATH), so without this
 * default a test that shells out to a rendered hook would silently resolve
 * whichever `ctxr` happens to be on the test runner's own PATH instead of
 * the build under test. A test that specifically wants to exercise the
 * PATH-only rung passes `{ CONTEXTURE_BIN: undefined }` to override it.
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
    CONTEXTURE_BIN: DIST_BIN,
    ...overrides,
  };
}
