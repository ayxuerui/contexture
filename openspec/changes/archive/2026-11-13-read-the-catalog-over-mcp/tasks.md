## 1. Readable set

- [x] 1.1 `widenedReadablePrefixes`: add the catalog path.
- [x] 1.2 Name the catalog section files in the `Read` and `Edit` descriptions, the refusal message and the README.

## 2. Verification

- [x] 2.1 Unit test: a catalog section file is read in the served commit and in a session, its gloss is edited and
  read back there, and a derived file beside it is still refused.
- [x] 2.2 Run `npm run typecheck && npm test` and `openspec validate read-the-catalog-over-mcp --strict`, and
  confirm both exit 0.
