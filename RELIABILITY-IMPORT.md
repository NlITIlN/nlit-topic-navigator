# 1.4.2 — additive recovery increment

## Scope
- Import the navigator's own `nlit-topics-export` format v1 JSON.
- File or pasted JSON → validation/read-only preview → explicit commit.
- Restore only missing IDs, including validated historical snapshots. Existing IDs are skipped even when content differs. Same title with different ID remains a different topic.
- Existing topics, selection, activity, metadata, and history are never overwritten.
- Preserve absent optional metadata in legacy history so restore semantics stay unchanged.
- Digest binds confirmation to normalized content. Actual commit rechecks existence transactionally; changes after preview can reduce additions.
- Transactional two-statement D1 batch: histories then topics, guarded by absence. Failure rolls back everything; repeated imports are idempotent by ID.
- No schema migrations. No public plugin/App identity changes.

## Limits and non-goals
- 100,000 UTF-8 bytes, 500 topics, 2,000 input historical entries. No truncation. Export can be larger; large-file recovery is not implemented.
- No replacing/merging existing topics, importing selection, cross-chat identification or automated topic extraction.
- No generic idempotency for all pre-existing create/append tools in this increment.
- Preview is advisory, not an exclusive database lock or stored approval token.
- A manually edited file with new IDs is a new import, not a retry. No account identifier embedded in export: caller must choose their own authorized backup.

## Validation
- `node tests.mjs`
- `node tests-phase4.mjs`
- `node tests-protocol.mjs`
- `node tests-import.mjs`
- `node tests-import-ui.mjs`
- `node node_modules/typescript/bin/tsc --noEmit`
- `npm run build`
All passed in cloud workspace. Tests use in-memory SQLite, fake transactional D1 adapter, actual TS handlers and VM UI events. No production writes or user-data testing.

Independent review `review_import` found legacy metadata and stale-file-input issues, both fixed; second review found no remaining blockers. Real native ChatGPT rendering, mobile/desktop visual QA and production D1 smoke remain unverified. After deployment perform authenticated read-only protocol/list/preview checks only, not test writes to user topics.
