## Why

A note's catalog gloss is authored by editing its line in the section file under the catalog path, and
`ctxr catalog build` only ever leaves a new note's gloss empty. A member working over MCP may `Edit` that file in
their session, since it is not a protected path, but `Read` refuses it: the catalog path lies under the store's
retrieval exclusions and was left out of the readable set. On 2026-11-13 a chat-app session in PKM that had added
a note tried to read `<session root>.contexture/catalog/projects.md` to write its gloss and got
`mcp.path_not_readable`, so the gloss could not be written from there.

## What Changes

- **The catalog's section files are readable.** `Read`, `Grep` and `Glob` answer for files under the catalog path,
  in the served commit and in a member's own session, as they already do for the templates, house conventions, log
  and skills. Nothing else under the retrieval exclusions becomes readable.

## Capabilities

### Modified Capabilities
- `remote-access`: the file tools' readable set gains the catalog path.

## Impact

- `src/core/mcp/paths.ts` (`widenedReadablePrefixes`), the refusal wording in `src/core/mcp/tools/files.ts`.
- `templates/mcp/Read.md`, `templates/mcp/Edit.md`, `README.md`.
- `test/unit/mcp-files.test.ts`.
