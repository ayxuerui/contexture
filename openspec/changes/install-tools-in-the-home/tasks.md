## 1. Version report

- [ ] 1.1 In `src/core/install-kind.ts`, classify a `node_modules` path not under Node's prefix
      against npm's configured global prefix: `NPM_CONFIG_PREFIX` / `npm_config_prefix`, else
      `npm prefix -g` with a short timeout; failure leaves `undetermined`.
- [ ] 1.2 Judge `install_writable` against the prefix the path was found under (its global
      package root and `bin`), not Node's directory.
- [ ] 1.3 Unit tests: env prefix, npm-reported prefix, npm unavailable, project dependency, Windows
      layout; the existing Node-prefix and linked cases unchanged.

## 2. Baseline conventions

- [ ] 2.1 Add an "Installing tools" section to `templates/conventions/baseline-conventions.md`,
      after "What stays out of the store": install as your own user with the publisher's own
      installer into your home; never `sudo`, never the store; `npm install -g` when
      `npm config get prefix` is in your home, otherwise report and stop.
- [ ] 2.2 Extend the baseline-rules test to assert the install rule, and that it names no
      directory, environment variable or container.
- [ ] 2.3 Check the rendered `AGENTS.md` of the largest client store stays under agy's 24 KB limit.

## 3. Upgrade skill

- [ ] 3.1 Rewrite the `install_writable: false` branch of `templates/skills/ctxr-upgrade.md`: never
      retry with `sudo`; report `install_path` and stop; name a global npm prefix in the home and,
      for a container image, a newer image as the remedies.
- [ ] 3.2 Update the skill test for the unwritable scenario.
- [ ] 3.3 Run the skill guards (tier words, flag attribution) over both changed templates.

## 4. Verify

- [ ] 4.1 `openspec validate install-tools-in-the-home --strict`.
- [ ] 4.2 In the runtime image, `ctxr version --check --json` reports `global` and writable for
      `~/.local/lib/node_modules/ctxr-cli`.
- [ ] 4.3 `npm test`, then `ctxr update` in a scratch store and read the rendered section and skill.
