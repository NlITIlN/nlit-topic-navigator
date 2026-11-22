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

const original=await run(db,"alice","topics_export");
const fixture={format:"nlit-topics-export",formatVersion:1,topics:[{id:"restored",title:"Восстановить",summary:"Контекст",decisions:"",nextStep:"",status:"active",updatedAt:"2026-11-17T00:00:00Z",revision:2,tags:["тест"],sources:[],groupName:"Тест",pinned:true}],history:[]};
fixture.history.push({topicId:"restored",revision:1,recordedAt:"2026-11-16T00:00:00Z",snapshot:{...fixture.topics[0],revision:1,title:"Раньше"}});
const backupJson=JSON.stringify(fixture);
const preview=await run(db,"alice","topics_import_preview",{backupJson});
assert.equal(preview.add.length,1);assert.equal(preview.historyCount,2);
assert.deepEqual((await run(db,"alice","topics_export")).topics,original.topics);
await assert.rejects(run(db,"alice","topics_import",{backupJson,previewDigest:preview.digest}),/подтверди/);
await assert.rejects(run(db,"alice","topics_import",{backupJson,previewDigest:"wrong",confirm:true}),/подтверди/);
failBatch=true;await assert.rejects(run(db,"alice","topics_import",{backupJson,previewDigest:preview.digest,confirm:true}),/simulated/);failBatch=false;
assert.equal((await run(db,"alice","topics_export")).topics.length,1);
assert.equal((await run(db,"alice","topics_export")).history.length,0);
const args={backupJson,previewDigest:preview.digest,confirm:true};
const result=await run(db,"alice","topics_import",args);assert.equal(result.added,1);assert.equal(result.historyAdded,2);
assert.equal((await run(db,"alice","topics_import",args)).added,0);
const changed=structuredClone(fixture);changed.topics[0].title="Не перезаписывать";const changedJson=JSON.stringify(changed);const p2=await run(db,"alice","topics_import_preview",{backupJson:changedJson});assert.equal(p2.skip.length,1);
await run(db,"alice","topics_import",{backupJson:changedJson,previewDigest:p2.digest,confirm:true});assert.equal((await run(db,"alice","topics_get",{id:"restored"})).topic.title,"Восстановить");
assert.equal((await run(db,"alice","topics_selected")).selected.id,"legacy");
assert.equal((await run(db,"bob","topics_export")).topics.length,0);
assert.equal((await run(db,"bob","topics_import_preview",{backupJson})).add.length,1);
assert.equal((await run(db,"bob","topics_import",args)).added,1);
for(const corrupt of [{...fixture,formatVersion:3},{...fixture,topics:[...fixture.topics,...fixture.topics]},{...fixture,history:[...fixture.history,...fixture.history]},{...fixture,history:[{...fixture.history[0],topicId:"else"}]},{...fixture,topics:[{...fixture.topics[0],sources:[{label:"bad",url:"javascript:alert(1)"}]}]}])await assert.rejects(run(db,"alice","topics_import_preview",{backupJson:JSON.stringify(corrupt)}));
await assert.rejects(run(db,"alice","topics_import_preview",{backupJson:"x".repeat(100001)}));
await assert.rejects(run(db,"","topics_import",args),/вход/);
const existing=(await run(db,"alice","topics_export")).topics.find(t=>t.id==="legacy");assert.deepEqual(existing,original.topics[0]);
// Legacy snapshots omit metadata; restore must preserve current metadata after import.
const legacy=structuredClone(fixture);legacy.topics[0].id="oldhistory";legacy.history[0].topicId="oldhistory";legacy.history[0].snapshot.id="oldhistory";
for(const k of ["tags","groupName","sources","pinned"])delete legacy.history[0].snapshot[k];
const lj=JSON.stringify(legacy),lp=await run(db,"alice","topics_import_preview",{backupJson:lj});await run(db,"alice","topics_import",{backupJson:lj,previewDigest:lp.digest,confirm:true});
const lr=await run(db,"alice","topics_restore",{id:"oldhistory",revision:1,expectedRevision:2});assert.deepEqual(lr.topic.tags,["тест"]);assert.equal(lr.topic.pinned,true);assert.equal(lr.topic.groupName,"Тест");
const roundTrip=await run(db,"alice","topics_export"),rt=JSON.stringify(roundTrip),rp=await run(db,"charlie","topics_import_preview",{backupJson:rt});
await run(db,"charlie","topics_import",{backupJson:rt,previewDigest:rp.digest,confirm:true});
assert.deepEqual((await run(db,"charlie","topics_export")).topics,roundTrip.topics);
const restoredAgain=await run(db,"charlie","topics_restore",{id:"oldhistory",revision:1,expectedRevision:3});assert.deepEqual(restoredAgain.topic.tags,["тест"]);assert.equal(restoredAgain.topic.pinned,true);
await assert.rejects(run(db,"alice","topics_import_preview",{backupJson:"я".repeat(50001)}),/100/);
unlinkSync("lib/topics-test.mjs");console.log("PASS additive import: preview read-only, explicit confirmation, digest, atomic rollback, repeat, conflict skip, selection/history preservation, tenant isolation, malformed/oversize");
