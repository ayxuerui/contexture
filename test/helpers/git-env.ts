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
    // No auto maintenance. Since git 2.47 a fetch or commit starts `git maintenance run --auto --detach`, which
    // outlives the command a test awaited and can still be writing into a .git the test, or the fake forge, is
    // removing (`rmdir .git: directory not empty`), or pruning a loose-object directory the next command writes into.
    // In the fake forge's merge clone that removal runs right after the push, so a failure there left the commit on
    // the base branch and the pull request open, and `ctxr land` reported merge-refused.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'maintenance.auto',
    GIT_CONFIG_VALUE_0: 'false',
    CONTEXTURE_STORE_ROOT: undefined,
    // Superseded name (rename-store-root-env-var): also scrubbed, so a
    // developer's still-exported old-name variable cannot leak into a test
    // run and make an otherwise-clean environment refuse.
    CONTEXTURE_ROOT: undefined,
    CONTEXTURE_BIN: DIST_BIN,
    ...overrides,
  };
}
