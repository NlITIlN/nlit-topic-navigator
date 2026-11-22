import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {mountFixturePanel} from "./chat-scope/fixture-panel.mjs";
import {rehearseFilmConversation} from "./chat-scope/film-rehearsal.mjs";
import {checkMergeJournal} from "./chat-scope/journal-rehearsal.mjs";
import {DatabaseSync} from "node:sqlite";
import ts from "typescript";

const read = path => readFileSync(path, "utf8");
function moduleUrl(source) {
  const js = ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
  return "data:text/javascript;base64," + Buffer.from(js).toString("base64");
}
const topics = moduleUrl(read("lib/topics.ts"));
const server = read("lib/server.ts")
  .replace('"./topics"', JSON.stringify(topics))
  .replace('import html from "./view.html?raw";', () => "const html=" + JSON.stringify(read("lib/view.html")) + ";");
const {handleTopics} = await import(moduleUrl(server));

const sql = new DatabaseSync(":memory:");
for (const file of readdirSync("drizzle").filter(f => f.endsWith(".sql")).sort())
  sql.exec(read("drizzle/" + file));
if (!sql.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name='chat_scopes'").get()) sql.exec(read("chat-scope/registry.sql"));
if (!sql.prepare("SELECT 1 FROM pragma_table_info('topics') WHERE name='auto_revision'").get()) sql.exec(read("chat-scope/auto-topics.sql"));
const db = {
  prepare(query) {
    const statement = sql.prepare(query);
    return {bind(...args) {
      return {
        all: () => ({results: statement.all(...args)}),
        first: () => statement.get(...args),
        run: () => ({meta: {changes: statement.run(...args).changes}}),
        execute() { return statement.columns().length ? this.all() : this.run(); }
      };
    }};
  },
  batch(statements) {
    sql.exec("BEGIN");
    try {
      const results = statements.map(s => s.execute());
      sql.exec("COMMIT");
      return results;
    } catch (e) {
      sql.exec("ROLLBACK");
      throw e;
    }
  }
};
let legacyReads = 0;
const env = {CHAT_DB: db, get DB() { ++legacyReads; throw Error("Unexpected legacy catalog access"); }};
const alice = "fixture-alice", bob = "fixture-bob";
const a = {owner: alice, session: "fixture-session-a"}, b = {...a, session: "fixture-session-b"};
const other = {owner: bob, session: a.session};
async function call(who, name, args = {}, api = false, extra = {}, bindings = env) {
  const headers = who.owner ? {"oai-authenticated-user-id": who.owner} : {};
  const params = {name, arguments: args, _meta: {"openai/session": who.session}};
  const body = api ? {...params, ...extra} : {jsonrpc: "2.0", id: 1, method: "tools/call", params, ...extra};
  const response = await handleTopics(new Request("https://fixture.invalid/" + (api ? "api/topics" : "mcp"), {
    method: "POST", headers, body: JSON.stringify(body)
  }), bindings);
  const data = await response.json();
  if (!response.ok) throw Error(response.status + " " + data.error);
  if (data.result?.isError) throw Error(data.result.content[0].text);
  return api ? data : data.result.structuredContent;
}
async function rpc(method, params, who = {}) {
  const response = await handleTopics(new Request("https://fixture.invalid/mcp", {
    method: "POST", headers: who.owner ? {"oai-authenticated-user-id":who.owner} : {},
    body: JSON.stringify({jsonrpc:"2.0", id:1, method, params:{...params, _meta:{"openai/session":who.session}}})
  }), env);
  return (await response.json()).result;
}
const listed = await rpc("tools/list", {});
const uri = listed.tools.find(t => t.name === "topics_panel")._meta.ui.resourceUri;
const resource = (await rpc("resources/read", {uri})).contents[0];
assert.equal(resource.mimeType, "text/html;profile=mcp-app");
const mount = (who, capabilities) => mountFixturePanel(resource.text, params => rpc("tools/call", params, who), capabilities);
const tables = ["chat_scopes","topics","topic_selection","topic_activity","topic_history","topic_merges","topic_enrichments"];
const snapshot = () => tables.map(table => sql.prepare("SELECT * FROM " + table + " ORDER BY rowid").all());
const register = async who => {
  const {fingerprint} = await call(who, "topics_scope_diagnostics");
  const confirmed = await call(who, "topics_scope_confirm", {fingerprint, confirm: true});
  assert.deepEqual(confirmed, {fingerprint, confirmed: true});
  return fingerprint;
};

assert.ok(snapshot().every(rows=>rows.length===0));
await rehearseFilmConversation({call,register,mount,snapshot});
await checkMergeJournal({call,register,snapshot,mountWith:(bridge,openingResult)=>mountFixturePanel(resource.text,bridge,{},openingResult),
  widgetCall:(who,params)=>rpc("tools/call",params,who)});
const empty = snapshot();
const fingerprintA = (await call(a, "topics_scope_diagnostics")).fingerprint;
await assert.rejects(call(a, "topics_list"), /не подтверждён/);
await assert.rejects(call(a, "topics_create", {title: "no auto-create"}), /не подтверждён/);
await assert.rejects(call(a, "topics_scope_confirm", {fingerprint: fingerprintA}), /явно подтверди/);
await assert.rejects(call(b, "topics_scope_confirm", {fingerprint: fingerprintA, confirm: true}), /явно подтверди/);
assert.deepEqual(snapshot(), empty);
const blocked = await rpc("tools/call", {name:"topics_panel"}, a);
assert.equal(blocked.isError, true);
assert.match(blocked.content[0].text, /попроси|скажи/i);
assert.equal(blocked.structuredContent, undefined);
assert.match((await mount(a)).status, /не подтверждён/);
await register(a);
for (const name of ["topics_panel","topics_open"]) {
  const emptyPanel = await rpc("tools/call", {name}, a);
  assert.equal(emptyPanel.structuredContent.total, 0);
  assert.match(emptyPanel.content[0].text, /пока нет тем/);
  assert.match(emptyPanel.content[0].text, /ассистента/i);
}
const firstPanel = await mount(a);
assert.match(firstPanel.list, /пока нет тем/);
assert.match(firstPanel.list, /видимого обсуждения/);
const fingerprintB = await register(b);
assert.notEqual(await register(other), fingerprintA);
await register(a);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM chat_scopes").get().n, empty[0].length + 3);
const make = async (who, title) => (await call(who, "topics_create", {
  title, groupName: title, tags: [title],
  bindings: [{kind:"chat", provider:"other", label:title, sourceId:title}]
})).topic;
const ta = await make(a, "A-only"), tb = await make(b, "B-only"), tc = await make(other, "Bob-only");
await call(a, "topics_select", {id:ta.id});
await call(b, "topics_select", {id:tb.id});
await call(other, "topics_select", {id:tc.id});

for (const [who, own] of [[a,ta],[b,tb],[other,tc]]) {
  for (const name of ["topics_list", "topics_open", "topics_panel"]) {
    const list = await call(who, name);
    assert.deepEqual(list.topics.map(t => t.id), [own.id]);
    assert.deepEqual(list.groups, [own.title]);
    assert.deepEqual(list.tags, [own.title]);
    assert.equal(list.selected.id, own.id);
  }
  const backup = await call(who, "topics_export");
  assert.deepEqual(backup.topics.map(t => t.id), [own.id]);
  assert.deepEqual(backup.history.map(h => h.topicId), [own.id]);
  assert.equal(backup.selected.id, own.id);
}
assert.equal((await call(a, "topics_list", {query:"B-only", owner:bob, scopeFingerprint:fingerprintB})).total, 0);
await assert.rejects(call(a, "topics_get", {id:tb.id}), /Тема не найдена/);
await assert.rejects(call(a, "topics_select", {id:tb.id}), /Тема не найдена/);
await assert.rejects(call(a, "topics_update", {id:tb.id, expectedRevision:1, title:"wrong"}), /Тема не найдена/);
const beforeView = snapshot();
const unregistered = {owner:alice, session:"fixture-unknown"};
assert.deepEqual((await call(unregistered, "topics_view_owned", {id:tb.id})).topic, tb);
await assert.rejects(call(unregistered, "topics_selected"), /не подтверждён/);
await assert.rejects(call({...unregistered, owner:bob}, "topics_view_owned", {id:ta.id}), /Тема не найдена/);
assert.deepEqual((await call(b, "topics_view_owned", {id:ta.id})).topic, ta);
assert.deepEqual((await call(a, "topics_view_owned", {id:tb.id})).topic, tb);
await assert.rejects(call(other, "topics_view_owned", {id:ta.id, sourceFingerprint:fingerprintA, owner:alice}), /Тема не найдена/);
assert.deepEqual(snapshot(), beforeView);
assert.equal((await call(a, "topics_selected")).selected.id, ta.id);
assert.equal((await call(b, "topics_selected")).selected.id, tb.id);

// Mount a fresh resource twice, like closing and reopening each panel after the manual read.
for (const [who, own, foreign] of [[a,ta,tb],[b,tb,ta]]) {
  for (let opening = 0; opening < 2; opening++) {
    const panel = await mount(who);
    assert.ok(panel.selected.includes(own.title) && panel.list.includes(own.title));
    assert.ok(!panel.list.includes(foreign.title));
    const fallback = await rpc("tools/call", {name:"topics_panel"}, who);
    assert.ok(fallback.content[0].text.includes(own.title));
    assert.ok(!fallback.content[0].text.includes(foreign.title));
  }
}
assert.deepEqual(snapshot(), beforeView);
const spoof = {owner:alice, fingerprint:fingerprintA, confirm:true, id:ta.id, _meta:{"openai/session":a.session}};
for (const session of [undefined, "", [], "bad session", "fixture-unknown"]) {
  for (const name of ["topics_list","topics_selected","topics_open","topics_panel","topics_view_owned","topics_export","topics_create","topics_scope_confirm"]) {
    if (session === unregistered.session && name === "topics_view_owned") continue; // explicit read covered above
    await assert.rejects(call({owner:alice,session}, name, spoof, false, {_meta:spoof._meta}), /Контекст чата недоступен|не подтверждён|явно подтверди/);
  }
}
await assert.rejects(call(a, "topics_list", spoof, true), /400 Контекст чата недоступен/);
await assert.rejects(call({session:a.session}, "topics_view_owned", spoof), /Требуется вход/);
await assert.rejects(call({session:a.session}, "topics_list", spoof, true), /401/);
await assert.rejects(call(a, "topics_list", {}, false, {}, {get DB(){ ++legacyReads; }}), /Хранилище тем чатов не настроено/);
assert.deepEqual(snapshot(), beforeView);

// Import preserves IDs. Manual access must not arbitrarily choose a copy.
const backupJson = JSON.stringify(await call(a, "topics_export"));
const preview = await call(b, "topics_import_preview", {backupJson});
await call(b, "topics_import", {backupJson, previewDigest:preview.digest, confirm:true});
await call(b, "topics_update", {id:ta.id, expectedRevision:1, title:"B copy"});
await assert.rejects(call(b, "topics_view_owned", {id:ta.id}), /нескольких чатах/);
assert.equal((await call(b, "topics_view_owned", {id:ta.id, sourceFingerprint:fingerprintA})).topic.title, "A-only");
assert.equal((await call(a, "topics_view_owned", {id:ta.id, sourceFingerprint:fingerprintB})).topic.title, "B copy");
assert.equal((await call(b, "topics_selected")).selected.id, tb.id);
assert.equal(legacyReads, 0);
sql.close();
console.log("PASS chat scope HTTP handler: A/B, owner isolation, no auto-creation or legacy reads, read-only manual view, ambiguous imports, scoped selection and export.");
