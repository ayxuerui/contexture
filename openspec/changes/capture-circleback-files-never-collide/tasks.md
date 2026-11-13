## 1. Runner

- [x] 1.1 `sweep.mjs`: when a record's file name is already taken in the inbox, add the meeting id to it.

## 2. Verification

- [x] 2.1 Integration test: two owed meetings on one day whose titles slug to the same name are written to two
  files, the second carrying its id, each holding its own source id.
- [x] 2.2 Run `npm run typecheck && npm test` and `openspec validate capture-circleback-files-never-collide --strict`,
  and confirm both exit 0.
