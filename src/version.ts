/** Kept in sync with package.json's "version" field. */
export const CLI_VERSION = '0.9.0';

/**
 * The npm package this executable is published as. Bound here, beside the
 * version, because the release check resolves the latest published release by
 * name — and a name that drifts from package.json would send that check at a
 * package nobody installs. test/unit/cli-name.test.ts holds the two together.
 */
export const CLI_PACKAGE_NAME = 'ctxr-cli';
