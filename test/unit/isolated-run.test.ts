import { describe, expect, it } from 'vitest';
import { scrubbedChildEnv } from '../../src/core/harness/isolated-run.js';

/**
 * isolate-the-portability-test (task 2.5): asserted on the constructed env
 * object, so no process is spawned — the property is what the child would be
 * given, and building it is a pure function of the injected environment.
 */
describe('scrubbedChildEnv', () => {
  const HOME_DIR = '/tmp/empty-home';

  it('repoints the harness home at the empty directory', () => {
    const env = scrubbedChildEnv({ HOME: '/home/operator', USERPROFILE: 'C:\\Users\\operator' }, HOME_DIR);
    expect(env.HOME).toBe(HOME_DIR);
    expect(env.USERPROFILE).toBe(HOME_DIR);
  });

  it('removes the store-root variable, so the child cannot be pointed back at the live store', () => {
    const env = scrubbedChildEnv({ CONTEXTURE_ROOT: '/home/operator/store' }, HOME_DIR);
    expect('CONTEXTURE_ROOT' in env).toBe(false);
  });

  it('removes every XDG key', () => {
    const env = scrubbedChildEnv(
      { XDG_CONFIG_HOME: '/home/operator/.config', XDG_DATA_HOME: '/home/operator/.local/share', XDG_CACHE_HOME: '/c' },
      HOME_DIR,
    );
    expect(Object.keys(env).filter((k) => k.startsWith('XDG_'))).toEqual([]);
  });

  it('cuts git off from a global config', () => {
    expect(scrubbedChildEnv({}, HOME_DIR).GIT_CONFIG_GLOBAL).toBe('/dev/null');
  });

  /**
   * PATH is the subject of the prerequisites step, not something the run
   * isolates from — scrubbing it would make that step test nothing.
   */
  it('preserves PATH intact', () => {
    const env = scrubbedChildEnv({ PATH: '/usr/bin:/bin' }, HOME_DIR);
    expect(env.PATH).toBe('/usr/bin:/bin');
  });

  it('carries through unrelated variables, and drops undefined ones', () => {
    const env = scrubbedChildEnv({ LANG: 'en_US.UTF-8', SOMETHING_UNSET: undefined }, HOME_DIR);
    expect(env.LANG).toBe('en_US.UTF-8');
    expect('SOMETHING_UNSET' in env).toBe(false);
  });

  it('does not mutate the environment it was given', () => {
    const original = { HOME: '/home/operator', CONTEXTURE_ROOT: '/store' };
    scrubbedChildEnv(original, HOME_DIR);
    expect(original).toEqual({ HOME: '/home/operator', CONTEXTURE_ROOT: '/store' });
  });
});
