# __DISPLAY_NAME__

This plugin connects an app to the __STORE_NAME__ contexture store, at `__MCP_URL__`. It carries:

- the store's skills, which say how to capture material, file it into notes, find connections, keep
  rollups and the mission current, and submit a change for approval;
- the store's server, which reads the store and keeps each change in a session of your own until you
  submit it. Nothing lands until someone approves it on the store's approval page, at `__BASE_URL__/approve/`.

Signing in goes through the store's own login. The plugin holds no credential.

Version __VERSION__, built by ctxr from the store's configuration. Download a newer one from
`__BASE_URL__/plugin/` when the store's skills change.
