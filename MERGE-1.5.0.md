# 1.5.0: safe two-topic consolidation

## User flow
Toolbar **Объединить темы** → select primary and secondary → full before/after preview → explicit confirmation. Primary keeps title/group/status, receives both text sets with provenance labels, tag/source unions and pin OR. Secondary is archived, not deleted or emptied. Its name, group and original metadata stay accessible under its own ID. Both histories remain separate and accessible. Global selection and per-panel context are not changed.

**Журнал объединений** → select operation → preview undo → explicitly confirm. Undo restores all original fields as new revisions, never deletes intervening history. If either topic was modified after merge, undo refuses rather than discarding the newer work. There is no forced overwrite option.

## API
- `topics_merge_preview(primaryId, secondaryId)`: read-only full plan and digest.
- `topics_merge(primaryId, secondaryId, operationId, previewDigest, confirm:true)`: one operation. New UUID for new intent; retain same UUID and digest after uncertain network response.
- `topics_merges_list(offset?)`: 50 audit summaries with nextOffset.
- `topics_merge_get(operationId)`: preserved pre/post images and state.
- `topics_merge_undo_preview(operationId)`: read-only undo diff/digest, only if revisions remain unchanged.
- `topics_merge_undo(operationId, previewDigest, confirm:true)`: idempotent undo.

## Safety
Migration 0004 adds only `topic_merges`; no alterations/deletions of existing data. Immutable payload stores preimages and postimages, mutable state transitions pending→applied→undo_pending→undone occur inside D1 batch transactions. Both expected revisions are checked together when entering a pending state. Every data write is gated on that pending operation. History snapshots surround updates; any late failure rolls the complete batch back. Conflicts create no partial operation. Repeated IDs cannot reapply edits. Same ID with different digest is rejected. Authentication owner scopes every read/write. No external calls or execution of note text.

Preview includes all original and intended fields. Invalid, same-ID or archived topic merge rejected. Existing field/tag/source limits are enforced with refusal, never truncation. Undo history and current preimages preserve legacy metadata behavior. Stored note text renders only as textContent.

## Explicit limits
- Two topics per operation; no automatic duplicate detection.
- Panel selection supports accounts up to 100 topics; larger accounts use tools with exact topic IDs. Operation journal is paginated.
- A merge must not include an already archived topic. User may explicitly restore it before creating a new plan.
- Metadata such as the secondary's different group/title remains on its archived original rather than overwritten into primary.
- Exports include `mergeAudit` as audit evidence. Additive import restores topics and revision history but DOES NOT import executable merge/undo records. Restored backup topics can be restored by their individual history; previous operation-wide undo is not reconstructed. Preview explicitly warns this.
- No production/user merge executed in development. Native ChatGPT UI on phone/PC unverified; VM UI tests exercise event guards rather than visual rendering.

## Tests
All existing suites plus tests-merge.mjs and tests-merge-ui.mjs pass; tsc and build pass. Isolated SQLite tests cover both topic races, same-operation-ID different plans, late transactional failures after data writes, undo rollback/conflicts, repeated requests, tenant separation, all fields/history/selection, limit refusal and export/import roundtrip. Parent additionally verified real local Miniflare D1 merge/undo and import/history restoration.

## Deployment/rollback
Do not deploy until independent review and read-only user baseline verification. Same private Site identity. A rollback to 1.4.2 can leave additive table in place; do not drop it. Existing topics/history remain readable. While rolled back, old UI cannot offer merge undo and old exports omit operation audit; use pre-rollback export or redeploy 1.5.0 to access operations. Never perform destructive down-migrations to roll back code.
