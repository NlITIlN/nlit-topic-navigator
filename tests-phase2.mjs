import {DatabaseSync} from "node:sqlite";
import {readFileSync,writeFileSync,unlinkSync} from "node:fs";
import ts from "typescript";
import assert from "node:assert/strict";
writeFileSync("lib/topics-test.mjs",ts.transpileModule(readFileSync("lib/topics.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);
const {run,validate,tools}=await import("./lib/topics-test.mjs");
const sql=new DatabaseSync(":memory:");
sql.exec(readFileSync("drizzle/0000_broken_king_cobra.sql","utf8"));
sql.exec(readFileSync("drizzle/0001_concerned_bullseye.sql","utf8"));
sql.prepare("INSERT INTO topics VALUES(?,?,?,?,?,?,?,?,?)").run("alice","legacy","Исходная тема","Сохранить это","Решение","Дальше","active","2026-11-16T00:00:00Z",7);
sql.prepare("INSERT INTO topic_selection VALUES(?,?,?)").run("alice","legacy","2026-11-16T00:00:00Z");
sql.exec(readFileSync("drizzle/0002_slippery_random.sql","utf8"));
sql.exec(readFileSync("drizzle/0003_red_spacker_dave.sql","utf8"));
sql.exec(readFileSync("drizzle/0004_marvelous_doctor_octopus.sql","utf8"));
sql.exec(readFileSync("drizzle/0005_productive_changeling.sql","utf8"));
sql.exec(readFileSync("drizzle/0006_tricky_inhumans.sql","utf8"));
sql.exec(readFileSync("drizzle/0007_round_blazing_skull.sql","utf8"));
sql.exec(readFileSync("drizzle/0008_faithful_scorpion.sql","utf8"));
let failBatch=false;
const db={
 prepare(q){return {bind(...args){const s=sql.prepare(q);return {
  async all(){return {results:s.all(...args)}},async first(){return s.get(...args)},
  async run(){return {meta:{changes:s.run(...args).changes}}},
  sync(){return /^SELECT/.test(q)?{results:s.all(...args)}:{meta:{changes:s.run(...args).changes}}}};}}},
 async batch(stmts){sql.exec("BEGIN");try{const out=stmts.map((s,i)=>{if(failBatch&&i===1)throw Error("simulated failure");return s.sync()});sql.exec("COMMIT");return out}catch(e){sql.exec("ROLLBACK");throw e}}
};
assert.equal((await run(db,"alice","topics_selected")).topic.title,"Исходная тема");
let h=await run(db,"alice","topics_history",{id:"legacy"});assert.equal(h.current.revision,7);assert.equal(h.versions.length,1);assert.equal(h.versions[0].persisted,false);
await run(db,"alice","topics_update",{id:"legacy",expectedRevision:7,title:"Новая тема"});
h=await run(db,"alice","topics_history",{id:"legacy"});assert.deepEqual(h.versions.map(v=>v.revision),[8,7]);assert.equal(h.versions[1].topic.summary,"Сохранить это");
let restored=await run(db,"alice","topics_restore",{id:"legacy",revision:7,expectedRevision:8});assert.equal(restored.topic.revision,9);assert.equal(restored.topic.title,"Исходная тема");
assert.equal((await run(db,"alice","topics_selected")).selected.id,"legacy");
await assert.rejects(run(db,"alice","topics_restore",{id:"legacy",revision:7,expectedRevision:8}),/Конфликт/);
await assert.rejects(run(db,"bob","topics_history",{id:"legacy"}),/не найдена/);
await assert.rejects(run(db,"bob","topics_restore",{id:"legacy",revision:7,expectedRevision:9}),/не найдена/);
assert.equal((await run(db,"bob","topics_export")).topics.length,0);
assert.equal((await run(db,"bob","topics_export")).history.length,0);
const concurrent=await Promise.allSettled([
 run(db,"alice","topics_update",{id:"legacy",expectedRevision:9,title:"Победитель"}),
 run(db,"alice","topics_update",{id:"legacy",expectedRevision:9,title:"Проигравший"})
]);
assert.equal(concurrent.filter(x=>x.status==="fulfilled").length,1);
h=await run(db,"alice","topics_history",{id:"legacy"});assert.equal(h.current.revision,10);assert.equal(h.versions.length,4);assert.equal(h.versions[0].topic.title,"Победитель");
failBatch=true;
await assert.rejects(run(db,"alice","topics_update",{id:"legacy",expectedRevision:10,title:"Не сохранять"}),/simulated/);
failBatch=false;
assert.equal((await run(db,"alice","topics_get",{id:"legacy"})).topic.revision,10);
assert.equal((await run(db,"alice","topics_history",{id:"legacy"})).versions.length,4);
const n=(await run(db,"alice","topics_create",{title:"Новая"})).topic;
assert.equal((await run(db,"alice","topics_history",{id:n.id})).versions.length,1);
for(let i=1;i<=55;i++)await run(db,"alice","topics_update",{id:n.id,expectedRevision:i,summary:"Версия "+i});
h=await run(db,"alice","topics_history",{id:n.id});assert.equal(h.versions.length,50);assert.equal(h.nextBeforeRevision,7);
const tail=await run(db,"alice","topics_history",{id:n.id,beforeRevision:7});assert.deepEqual(tail.versions.map(x=>x.revision),[6,5,4,3,2,1]);
const exp=await run(db,"alice","topics_export");assert.equal(exp.topics.length,2);assert.equal(exp.history.length,60);assert.equal(exp.selected.id,"legacy");assert.equal(exp.history.some(x=>x.owner),false);
await assert.rejects(run(db,"","topics_export"),/вход/);
assert.throws(()=>validate({title:""}));assert.throws(()=>validate({status:"bad"}));assert.throws(()=>validate({summary:"x".repeat(4001)}));assert.ok(tools.some(t=>t.name==="topics_scope_confirm" && !t.annotations.readOnlyHint));assert.ok(tools.some(t=>t.name==="topics_view_owned" && t.annotations.readOnlyHint));

const meta=(await run(db,"alice","topics_create",{title:"МЕТАДАННЫЕ",tags:["3D","Дизайн"],groupName:"Студия",pinned:true,sources:[{label:"Документ",url:"https://example.com/doc"}]})).topic;
assert.deepEqual((await run(db,"alice","topics_get",{id:meta.id})).topic.tags,["3D","Дизайн"]);
assert.equal((await run(db,"alice","topics_list",{query:"метаданные"})).topics[0].id,meta.id);
assert.equal((await run(db,"alice","topics_list",{tag:"дизайн",groupName:"Студия",pinned:true})).total,1);
assert.equal((await run(db,"alice","topics_list",{query:"%"})).total,0);
assert.equal((await run(db,"bob","topics_list",{tag:"Дизайн"})).total,0);
assert.deepEqual((await run(db,"bob","topics_list")).tags,[]);
await run(db,"alice","topics_select",{id:meta.id});
assert.equal((await run(db,"alice","topics_list",{sort:"recent"})).topics[0].id,meta.id);
let m=(await run(db,"alice","topics_append_outcome",{id:meta.id,expectedRevision:1,summaryAddition:"Дописано без потери"})).topic;
assert.equal(m.pinned,true);assert.equal(m.sources[0].url,"https://example.com/doc");
m=(await run(db,"alice","topics_append_outcome",{id:meta.id,expectedRevision:2,summaryAddition:"Второй итог"})).topic;
assert.equal(m.summary,"Дописано без потери\n\nВторой итог");
await assert.rejects(run(db,"alice","topics_append_outcome",{id:meta.id,expectedRevision:1,decisionsAddition:"Устарело"}),/Конфликт/);
assert.throws(()=>validate({sources:[{url:"javascript:alert(1)",label:""}]}));
assert.throws(()=>validate({sources:[{url:"https://user:pass@example.com",label:""}]}));
assert.throws(()=>validate({tags:["x".repeat(41)]}));
for(let i=0;i<620;i++)sql.prepare("INSERT INTO topics(owner,id,title,summary,decisions,next_step,status,updated_at,revision) VALUES(?,?,?,?,?,?,?,?,?)").run("many","row"+String(i).padStart(4,"0"),i===619?"За пределами 500":"Тема "+i,"","","","active",String(i).padStart(4,"0"),1);
let page=await run(db,"many","topics_list",{limit:100,offset:500});
assert.equal(page.topics.length,100);assert.equal(page.total,620);assert.equal(page.nextOffset,600);
assert.equal((await run(db,"many","topics_list",{limit:100,offset:600})).topics.length,20);
assert.equal((await run(db,"many","topics_list",{query:"за пределами 500"})).total,1);
await assert.rejects(run(db,"many","topics_list",{limit:101}),/страница/);

assert.throws(()=>validate({tags:["a,b"]}));
assert.throws(()=>validate({sources:[{url:"https://example.com/a",label:"a|b"}]}));
assert.throws(()=>validate({sources:[{url:"https://example.com/a b",label:""}]}));
sql.prepare("UPDATE topic_history SET snapshot=json_remove(snapshot,'$.tags','$.groupName','$.sources','$.pinned') WHERE owner=? AND topic_id=? AND revision=?").run("alice",meta.id,1);
const kept=await run(db,"alice","topics_restore",{id:meta.id,revision:1,expectedRevision:3});
assert.equal(kept.topic.pinned,true);assert.deepEqual(kept.topic.tags,["3D","Дизайн"]);assert.equal(kept.topic.groupName,"Студия");
const html=readFileSync("lib/view.html","utf8");new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
unlinkSync("lib/topics-test.mjs");
console.log("PASS phases1-3: migration preserving current/selection; baseline; history; restore; conflicts; tenant isolation; transaction rollback; concurrent writes; pagination; complete export; UI syntax");
