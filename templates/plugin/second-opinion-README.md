# __DISPLAY_NAME__

A second opinion from several AI models of different families. You give Claude a written plan, or one
question, and the skill sends it to those models, then compares what they say. Nothing here reads or
changes a contexture store.

## Install this plugin or `__OTHER_PLUGIN__`, not both

The `__OTHER_PLUGIN__` plugin carries the same skill, with the skills for working in a store. Install
`__NAME__` only if you do not use `__OTHER_PLUGIN__`. With both installed, Claude is offered the skill twice.

## What you need

This plugin carries no connector. Add a second-opinion connector once, as a custom connector at the address
its connect page gives (`<the server's address>/mcp`), and sign in through the server's own login. The
connector offers four tools: `second_opinion_preflight`, `second_opinion_critique`, `second_opinion_poll`
and `second_opinion_result`.

A plan you send goes to the model vendors the server's operator configured. The skill tells you how to
check which ones before you send anything.

## Commands

__COMMANDS__

Text after the command is what the skill starts from, as in `/__NAME__:ask` followed by the plan.

## Updates

Install `__NAME__` from the `__MARKETPLACE__` marketplace with **Sync automatically** on, and Claude installs
each new release on its own. This is version __VERSION__, which matches the ctxr release it was built from.
If the skill names a tool your connector does not offer, the server runs an older ctxr.

## License

__LICENSE__. See `LICENSE`.
