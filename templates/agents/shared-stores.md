## Shared stores

This store mounts other stores. Each is a store of its own, cloned under `shared/`:

__MOUNT_LIST__

- A mounted store follows its own `contexture.yaml`. Its exclusions, conventions and review apply to its notes, not this store's.
- Its readers can differ from this store's. Write a note into a mount only when every reader of that store may see it.
- To write to a mount, start a session inside it: `cd shared/<name>` and run `ctxr session start`. Its change is a pull request on that store, approved and landed by that store.
- Link from this store into a mount with a path link, such as `[[shared/<name>/<path>]]`. A note in a mount can never link back into this store.
- Run `ctxr shared-stores sync` to clone a missing mount and bring the others up to date.
