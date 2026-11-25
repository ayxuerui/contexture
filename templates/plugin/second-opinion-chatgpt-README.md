# __DISPLAY_NAME__

This plugin connects an app to the second-opinion server of __STORE_NAME__, at `__MCP_URL__`. It carries:

- the `ctxr-second-opinion` skill, which says how to get a critique of a written plan, or a poll on one
  question, from several AI models of different families, and how to compare what they say;
- the server's connector, which offers four tools: `second_opinion_preflight`, `second_opinion_critique`,
  `second_opinion_poll` and `second_opinion_result`.

The server reads no notes and changes nothing. A plan you send goes to the model vendors the server's
operator configured.

Signing in goes through the server's own login. The plugin holds no credential.

Version __VERSION__, built by ctxr for this server. Download a newer one from `__BASE_URL__/plugin/` when
contexture releases a new skill.
