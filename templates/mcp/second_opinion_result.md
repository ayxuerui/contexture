Fetches a critique or poll that was still running when its call returned, as `ctxr second-opinion result` does.

- `run` is the run id the earlier result gave after `running:`.
- The call waits up to about 45 seconds for the run. A finished run returns its critiques or answers and the command's exit code. A run still going returns `running:` again: call this tool again with the same id.
- You can fetch only a run you started. The answers are kept for one hour after the run ends.
