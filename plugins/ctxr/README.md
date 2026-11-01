# ctxr

contexture's skills for working in a contexture store from Claude. A contexture store is a git repository
of markdown notes that a group of people keep together. The skills say how to capture material into the
store's inbox, file it into notes, find and propose connections between notes, keep rollups and the mission
current, and submit a change for someone to approve.

## What you need

This plugin carries no connector. Add your store's connector once, as a custom connector at the address
your store's connect page gives (`<the store's address>/mcp`), and sign in through the store's own login.
Someone in two stores adds two connectors; the skills work with whichever contexture connector is
attached, and ask which store you mean when it is unclear.

The skills name each store setting by a placeholder such as `<inbox path>`. The connector's instructions
give your store's value for each one, so the same plugin serves every store.

## Commands

Each command opens one skill, for when you would rather type it than ask in words:

- `/ctxr:capture` opens `ctxr-capture`
- `/ctxr:ingest` opens `ctxr-ingest-orchestration`
- `/ctxr:research` opens `ctxr-research`
- `/ctxr:rollup` opens `ctxr-rollup`
- `/ctxr:mission` opens `ctxr-mission`
- `/ctxr:session` opens `ctxr-session-lifecycle`
- `/ctxr:submit` opens `ctxr-submit`

Text after a command is what the skill starts from, as in `/ctxr:capture` followed by the material.

## Updates

Install `ctxr` from the `ayxuerui/contexture` marketplace with **Sync automatically** on, and Claude installs
each new release of contexture's skills on its own. This is version 0.35.0, which matches the ctxr
release it was built from. If a skill names a step your store's connector does not offer, your store's
server runs an older ctxr; the skill says so and skips that step.

## License

MIT. See `LICENSE`.
