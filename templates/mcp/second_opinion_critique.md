Sends a written plan to three or four critics, each on a different model family, as `ctxr second-opinion critique` does. It returns the lettered critiques and the table that says which critic wrote each letter.

- `plan` is the whole plan, as text. The critics see only this text. Write out everything they need: they read no file and no earlier message.
- `tier`, `only` and `timeout` are the command's options. `seed` makes the letter assignment repeatable.
- The call returns within about a minute. If the critics have finished, the result carries the critiques. If not, the result starts with `running:` and a run id. Call `second_opinion_result` with that id until the critiques come back.
- One second opinion runs at a time on the server. A busy refusal names your own run, so you can fetch it.
- The tool takes no file path. To get an opinion on a file, read the file first and pass its text.
