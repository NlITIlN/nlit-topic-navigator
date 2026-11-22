# Protocol/transport repair candidate (1.4.1), 2026-11-17

Source-only candidate; no deployment and no database migration. Based on d0f203b.
Preserves standalone web fallback, App/plugin identity and user data.

Changes:
- Every MCP result has resultType=complete; discovery and resource/tool listings/reads include ttlMs=0, cacheScope=private per 2026-07-28 schema.
- Discovery includes legacy 2025-11-25 alongside 2026-07-28; initialize remains legacy.
- No new strict inbound request rejection. Full request-contract enforcement is deferred until the actual host wire is observed; this is a narrow response/transport repair, not a claim of full 2026 compliance.
- UI responds to host ping and unknown requests. Incoming requests never resolve pending outgoing RPC merely by a colliding ID.
- Malformed responses and wrong-origin messages cannot settle pending RPC.

Tests executed:
- node tests.mjs PASS (phases 1–3 with in-memory SQLite).
- node tests-phase4.mjs PASS (existing phase4 simulations).
- node tests-protocol.mjs PASS (actual handler transpiled with only DB/UI imports stubbed; actual UI transport tested for ping, collision, malformed responses, origin and errors).
- npx tsc --noEmit PASS.
- npm run build PASS.
- npm run lint FAIL: same 22 preexisting no-explicit-any errors as base, not a lint-clean release.

No real ChatGPT/iOS panel launch has been observed. Passing mocks does not establish native launch success.
Before deployment: independent review, verify compatibility of actual Sites/host request metadata and ensure rollback to existing revision. Do not weaken authentication/CSP or delete connections as a workaround.

References:
- https://raw.githubusercontent.com/modelcontextprotocol/modelcontextprotocol/main/schema/2026-07-28/schema.ts
- https://github.com/openai/mcp-extensions/blob/main/docs/spec.md
