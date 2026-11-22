import assert from "node:assert/strict";
import {readFileSync, readdirSync} from "node:fs";
import {Miniflare} from "miniflare";
import ts from "typescript";

const read = f => readFileSync(f,"utf8");
const js = ts.transpileModule(read("lib/topics.ts"), {compilerOptions:{
  module:ts.ModuleKind.ESNext, target:ts.ScriptTarget.ES2022
}}).outputText;
const {run} = await import("data:text/javascript;base64,"+Buffer.from(js).toString("base64"));
const mf = new Miniflare({host:"127.0.0.1", modules:true, script:"export default {fetch(){return new Response('fixture')}}", d1Databases:["CHAT_DB"]});
try {
  const db = await mf.getD1Database("CHAT_DB");
  const migrations = readdirSync("drizzle").filter(f=>f.endsWith(".sql")).sort().map(f=>"drizzle/"+f);
  for (const file of migrations) {
    for (const statement of read(file).split("--> statement-breakpoint").map(s=>s.trim()).filter(Boolean))
      await db.prepare(statement).run();
  }
  const invoke = (name,args) => run(db,"fixture-A",name,args);
  const sync = cards => invoke("topics_sync_conversation",{cards});
  const root={path:["Сюжет"],done:"Синопсис готов.",decisions:"Финал открыт.",nextStep:"Раскадровка.",expectedRevision:0};
  const child={...root,path:["Сюжет","Финал"]};
  const [a,b]=await Promise.all([sync([child,root]),sync([root,child])]);
  assert.deepEqual([a.cards[0].status,b.cards[0].status].sort(),["saved","unchanged"]);
  const id=a.cards[0].id;
  const other=await run(db,"fixture-B","topics_sync_conversation",{cards:[root]});
  assert.notEqual(other.cards[0].id,id);
  await assert.rejects(run(db,"fixture-B","topics_select",{id}),/не найдена/);
  await invoke("topics_select",{id});
  const first={...root,expectedRevision:1,done:"",decisions:"",nextStep:"Сверить паузу."};
  const second={...first,nextStep:"Сверить темп."};
  const results=await Promise.all([sync([first]),sync([second])]);
  assert.deepEqual(results.map(r=>r.cards[0].status).sort(),["conflict","saved"]);
  const {topic}=await invoke("topics_selected");
  assert.equal(topic.revision,2);assert.equal(topic.id,id);
  assert.equal(topic.decisions,root.decisions);assert.equal(topic.summary,root.done);
  assert.equal((await invoke("topics_history",{id})).versions.length,2);
  assert.equal((await invoke("topics_list",{parentId:id})).total,1);
  assert.equal((await sync([{...root,path:["Нет корня","Лист"]}])).cards[0].status,"conflict");
  assert.equal((await invoke("topics_list",{})).total,2);
  await invoke("topics_create",{title:"Моя тема"});
  assert.equal((await sync([{...root,path:["Моя тема"]}])).cards[0].status,"conflict");
  assert.equal((await invoke("topics_list",{})).total,3);
  await invoke("topics_update",{id,expectedRevision:2,title:"Новый сюжет"});
  assert.equal((await sync([{...root,path:["Сюжет","Новая сцена"]}])).cards[0].status,"conflict");
  assert.equal((await invoke("topics_list",{parentId:id})).total,1);
  console.log("PASS automatic topic cards in isolated D1: scope-specific IDs, concurrent creation, revisions, history, selection, manual edits and missing parent.");
} finally { await mf.dispose(); }
