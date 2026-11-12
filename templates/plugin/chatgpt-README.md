# __DISPLAY_NAME__

This plugin connects an app to the __STORE_NAME__ contexture store, at `__MCP_URL__`. It carries:

- contexture's skills, the same for every store, which say how to capture material, file it into notes, find connections, keep
  rollups and the mission current, and submit a change for approval;
- the store's server, which reads the store and keeps each change in a session of your own until you
  submit it. Nothing lands until someone approves it on the store's approval page, at `__BASE_URL__/approve/`.

Signing in goes through the store's own login. The plugin holds no credential.

The skills name each store setting by a placeholder such as `<inbox path>`, and the store's server gives
its value for each one when the app connects.

Version __VERSION__, built by ctxr for this store. Download a newer one from `__BASE_URL__/plugin/` when
contexture releases new skills.
