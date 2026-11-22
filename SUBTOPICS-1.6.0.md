# Subtopics 1.6.0

## Behavior
- `parentId: string | null` on every current topic; null means root.
- `topics_create`, `topics_update` accept parentId; `topics_update` requires expectedRevision. `topics_list` with omitted parentId is the original flat query, null lists roots, an ID lists immediate children. Existing metadata fields remain unchanged.
- Dedicated collapsible tree loads 100 siblings per page, includes archived ancestors and children, independent of flat-list search/filters. Expansion is temporary; refreshing rebuilds the tree.
- Editor allows moving to root or another topic, preserving its own descendants. Parent choices load up to1000 topics; beyond that parent editing is disabled and Nlit tools with exact IDs remain available. Missing current parent in a paginated picker is explicitly retained by ID.
- Archive changes only that topic's status. Children keep their links/status/data. Merge archives secondary without adopting or deleting its children.

## Data integrity
- Additive migration0005 adds nullable parent_id, existing rows become roots without revision changes. INSERT/UPDATE triggers check same-owner parent existence and ancestor cycle via owner-scoped recursive UNION. Checks run in the write transaction, preventing concurrent inverse moves. Delete trigger prohibits deleting a parent with children.
- Migration0006 adds index(owner,parent_id).
- History snapshots include parentId. Restoring new snapshots restores explicit parent (including root), subject to same DB validation. Old snapshots omitting parentId preserve current parent.
- Merge/undo keep each topic's parent. Existing merge payloads without parentId preserve current relationship; new snapshot and row use the identical resolved parent. Parent edits increment revision and block conflicting undo.
- All parent mutations leave selection unchanged. No automatic chat binding or topic extraction.

## Backup compatibility
- New exports use formatVersion2 so older apps reject instead of silently discarding hierarchy.
- Import accepts v1 (legacy roots) and v2 (current parentId mandatory). Legacy history may omit parentId.
- Preview validates the EFFECTIVE graph: live skipped IDs retain live parents, missing topics come from backup. Missing parent/cycle rejects, never silently roots. Missing topics are topologically sorted and INSERT SELECT explicitly ORDER BY array index. DB triggers revalidate atomically, including concurrent changes.
- Historical references to now-unavailable parents remain preserved as history; explicit restoration rejects until a valid parent exists. No silent repair.
- Existing import100KB/500topics/2000history limits remain. Merge audit remains audit-only; imported backups do not recreate undo operation rights.

## Checks
All nine suites (existing7 + subtopics backend/UI), tsc and build. Isolated tests cover migration, same-owner/missing/self/indirect/cross-owner links, concurrent inverse moves, archive and selection, restore legacy/new history, v1/v2 backup, orphan/cycle rejection, reversed import order, merge children/undo conflicts, legacy payload resolved history, UI lazy expansion and async cancellation, missing/current parent and >1000 picker fallback.
Independent review and actual Miniflare D1 checks coordinated by parent. No production data changes or deployment performed by implementer.

## Rollback
Application rollback to1.5.0 may leave nullable column/triggers/index installed; do not drop or clear hierarchy. Old code updates do not assign parent_id, but old exporter omits hierarchy and old backups are not complete tree backups. Restore forward to1.6.0 to resume hierarchy operations. Keep format2 backups outside old app; old importer correctly rejects them.
