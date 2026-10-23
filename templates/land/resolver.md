You resolve a rebase conflict for pull request #__PR__ in this git checkout. `ctxr land` runs you without a person present.

Rebase the checked-out commit onto `__BASE__`. Resolve every conflict by the playbook below. Then stop.

This checkout may not be a session worktree, so run the playbook's steps with git here: `git rebase __BASE__`, then for each resolved file `git add <file>` and `GIT_EDITOR=true git rebase --continue`. Why: `ctxr session rebase` acts only on a session worktree.

Do not push. Why: `ctxr land` checks your result and pushes it.
Do not change anything the conflict does not need. Why: a person approves the result before it lands, and they read every change.
Leave no uncommitted work, and leave no rebase in progress. Why: `ctxr land` refuses a result that does either.
If you cannot keep both meanings, abort the rebase with `git rebase --abort` and exit with a non-zero code. Why: a person then resolves it.

The playbook:

__PLAYBOOK__
