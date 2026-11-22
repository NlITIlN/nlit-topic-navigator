# Phase 4 / 1.4.0

Existing identity, access and D1 schema preserved; no data migration or production writes.

## Implemented
- Capability-aware conversation context via MCP App ui/update-model-context. Explicit attach, refresh and clear, restored from host modelContext where supplied. Does not mutate account-wide selection.
- Distinct draft (openai/message send:false) and explicit send. No automatic sending; uncertain-send warning and disabled send until dialog reopened.
- Account-wide selection explicitly labelled. Working website fallback retained.
- Host diagnostics and foreground refresh. Source links included in generated continuation text.
- Skill distinguishes conversation context from account fallback, always reloads actual record, and permits source recovery only under current request/authorized reader.

## Verified
- Node regression suite phases 1–3 (SQLite adapter), typecheck.
- Phase4 VM UI test: capability gates, host attach/clear/restoration, no global selection write, draft/send routing, uncertain send.
- Desktop browser preview: diagnostics display, add form and cancel, no production changes. Local authenticated DB UI unavailable (401 expected).

## Limits
No documented stable thread ID. Context is per MCP App instance, not a server-side per-thread selection. No assertion of cross-device restoration of the host context. Native Dot iOS/desktop and ordinary ChatGPT UI behavior still require real-client checks. Official Extensions support table excludes classic ChatGPT from its Web column.
No drawer/avatars/icons, auto-tagging, subtopics or automatic reading of linked sources. Phase3 merge remains deferred.

Sources: https://github.com/openai/mcp-extensions/blob/main/docs/spec.md and docs/patterns.md, read 2026-11-17.
