# second opinion

A second opinion from several AI models of different families. You give Claude a written plan, or one
question, and the skill sends it to those models, then compares what they say. Nothing here reads or
changes a contexture store.

## Install this plugin or `contexture`, not both

The `contexture` plugin carries the same skill, with the skills for working in a store. Install
`second-opinion` only if you do not use `contexture`. With both installed, Claude is offered the skill twice.

## What you need

This plugin carries no connector. Add a second-opinion connector once, as a custom connector at the address
its connect page gives (`<the server's address>/mcp`), and sign in through the server's own login. The
connector offers four tools: `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll`
and `second_opinion_result`.

A plan you send goes to the model vendors the server's operator configured. The skill tells you how to
check which ones before you send anything.

## Commands

- `/second-opinion:ask` opens `ctxr-second-opinion`

Text after the command is what the skill starts from, as in `/second-opinion:ask` followed by the plan.

## Updates

Install `second-opinion` from the `ayxuerui/contexture` marketplace with **Sync automatically** on, and Claude installs
each new release on its own. This is version 0.45.0, which matches the ctxr release it was built from.
If the skill names a tool your connector does not offer, the server runs an older ctxr.

## License

MIT. See `LICENSE`.
