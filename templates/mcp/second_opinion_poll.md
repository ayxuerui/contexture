Sends one question to the same three model families, as `ctxr second-opinion poll` does, and returns each answer.

- `prompt` is the question and its options, as text. The models see only this text.
- `lens` is two or three comma-separated taste lenses: built-in names or `Name:description`. `wrap: false` sends the question as written, without the answer scaffold.
- `tier`, `only` and `timeout` are the command's options.
- The call returns within about a minute. If the result starts with `running:` and a run id, call `second_opinion_result` with that id until the answers come back.
- One second opinion runs at a time on the server. A busy refusal names your own run, so you can fetch it.
