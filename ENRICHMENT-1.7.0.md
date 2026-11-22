# 1.7.0 — reviewed conversation enrichment, tools-first

## Actual capability
The assistant, only on explicit user request, proposes notes/tags from the visible current conversation. The plugin does not run AI, read conversations, retrieve sources, verify truth, monitor background activity or infer which chat is active. `sourceScope=current_visible_conversation` is a caller declaration, not verified provenance.

`topics_enrichment_preview` takes exact existing topic id, expectedRevision, sourceScope, notes[{kind:fact|idea|decision,text}], tags. It reads the topic and returns before/after, digest, changes, skipped exact notes and added tags; it writes nothing to navigator storage. Chat/tool transcripts can still retain the proposal.

Facts and ideas append to summary; decisions append to decisions. Labels remain explicit (`[Факт]`, `[Идея]`, `[Решение]`). Each note is one line, up to1000 characters, no control/line-separator characters; up to10 notes and10 proposed tags. Inputs that exceed resulting topic limits fail, never truncate. Exact labeled blocks dedupe; tags compare trimmed/case-insensitively while preserving all pre-existing entries. Semantic duplicates and truth must be assessed by assistant/user.

After the user approves the exact displayed candidate, `topics_enrichment_commit` receives that unchanged candidate, previewDigest, unique operationId and confirm=true. Operation insert guarded by expectedRevision, old/new snapshots, text/tag update and applied state execute in one D1 transaction. Existing nextStep/title/group/status/pin/sources/parent and account selection remain untouched. Repeated operationId returns receipt; changed candidate/digest under same ID rejects. New operationId with already-present exact notes/tags is a no-op, not a new revision or receipt. A conflicting revision requires new preview and user confirmation.

`topics_enrichment_get(operationId)` reads a saved receipt after an uncertain response. Preview is not an app-side approval authority; the assistant must actually obtain user confirmation before calling commit. Existing lower-level manual editing tools remain available and do not become automatic.

## Privacy/recovery
Do not supply full transcripts, credentials or sensitive personal material. Only the minimal candidate is sent. Confirmed receipt contains candidate and topic before/after; preview drafts are not persisted in navigator DB. Export format2 includes enrichmentAudit as audit-only; import restores notes/history but not operation receipts. Undo uses explicit existing historical restore after comparison, not an automatic receipt reversal.

## Tests and deployment
New migration0007 adds owner-scoped receipt table. Existing tables/data preserved. Ten isolated suites, tsc/build, plus independent review before deployment. Production has not been altered by implementation.
UI adds truthful explanatory text; this release's enrichment preview/confirmation workflow is in the conversation through tools, not a separate generated-draft panel. Phone/PC native tool workflow still needs live user verification.

Rollback can redeploy prior1.6.0 without dropping receipt table. Preserve version2 backups, history and receipts; prior export omits enrichmentAudit, so do not claim it a complete operation audit after rollback. Do not restore live data or create real test proposals during deploy smoke.
