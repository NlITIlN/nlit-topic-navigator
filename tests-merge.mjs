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
let failBatch=false,failAt=1,beforeBatch=null;
const db={
 prepare(q){return {bind(...args){const s=sql.prepare(q);return {
  async all(){return {results:s.all(...args)}},async first(){return s.get(...args)},
  async run(){return {meta:{changes:s.run(...args).changes}}},
  sync(){return /^SELECT/.test(q)?{results:s.all(...args)}:{meta:{changes:s.run(...args).changes}}}};}}},
 async batch(stmts){if(beforeBatch){const f=beforeBatch;beforeBatch=null;f()}sql.exec("BEGIN");try{const out=stmts.map((s,i)=>{if(failBatch&&i===failAt)throw Error("simulated failure");return s.sync()});sql.exec("COMMIT");return out}catch(e){sql.exec("ROLLBACK");throw e}}
};


const primary=(await run(db,"alice","topics_create",{title:"Главная",summary:"Первый",decisions:"Да",nextStep:"Шаг1",tags:["a"],groupName:"Группа1"})).topic;
const secondary=(await run(db,"alice","topics_create",{title:"Вторая",summary:"Второй",decisions:"Нет",nextStep:"Шаг2",tags:["b"],groupName:"Группа2",pinned:true})).topic;
await run(db,"alice","topics_select",{id:secondary.id});
const ids={primaryId:primary.id,secondaryId:secondary.id};
const before=await run(db,"alice","topics_export");const plan=await run(db,"alice","topics_merge_preview",ids);
assert.equal((await run(db,"alice","topics_export")).mergeAudit.length,0);assert.equal(plan.after[1].status,"archived");assert.match(plan.after[0].summary,/Первый/);assert.match(plan.after[0].summary,/Второй/);
let args={...ids,operationId:"op1",previewDigest:plan.digest,confirm:true};
await assert.rejects(run(db,"alice","topics_merge",{...args,confirm:false}),/подтвердить/);
await assert.rejects(run(db,"bob","topics_merge_preview",ids),/не найдена/);
failBatch=true;await assert.rejects(run(db,"alice","topics_merge",args),/simulated/);failBatch=false;assert.equal((await run(db,"alice","topics_export")).mergeAudit.length,0);assert.deepEqual((await run(db,"alice","topics_export")).topics,before.topics);
await run(db,"alice","topics_merge",args);const merged=await run(db,"alice","topics_export");assert.equal(merged.mergeAudit.length,1);assert.equal(merged.topics.find(t=>t.id===secondary.id).status,"archived");assert.equal(merged.selected.id,secondary.id);
assert.equal((await run(db,"alice","topics_merge",args)).replayed,true);assert.deepEqual((await run(db,"alice","topics_export")).history,merged.history);
await assert.rejects(run(db,"alice","topics_merge",{...args,previewDigest:"wrong"}),/занят/);
const undo=await run(db,"alice","topics_merge_undo_preview",{operationId:"op1"});
const ua={operationId:"op1",previewDigest:undo.digest,confirm:true};failBatch=true;await assert.rejects(run(db,"alice","topics_merge_undo",ua),/simulated/);failBatch=false;
assert.equal((await run(db,"alice","topics_merge_get",{operationId:"op1"})).state,"applied");
await run(db,"alice","topics_merge_undo",ua);assert.equal((await run(db,"alice","topics_merge_undo",ua)).replayed,true);
const undone=await run(db,"alice","topics_export");for(const old of [primary,secondary]){const now=undone.topics.find(t=>t.id===old.id);for(const k of ["title","summary","decisions","nextStep","status","tags","groupName","sources","pinned"])assert.deepEqual(now[k],old[k]);assert.equal(now.revision,3)}assert.equal(undone.selected.id,secondary.id);assert.ok(undone.history.length>merged.history.length);
// Both-revision atomic conflict: mutate secondary immediately before transaction.
const plan2=await run(db,"alice","topics_merge_preview",ids);beforeBatch=()=>sql.prepare("UPDATE topics SET revision=revision+1 WHERE owner='alice' AND id=?").run(secondary.id);
await assert.rejects(run(db,"alice","topics_merge",{...ids,operationId:"race",previewDigest:plan2.digest,confirm:true}),/Конфликт/);assert.equal((await run(db,"alice","topics_get",{id:primary.id})).topic.revision,3);assert.equal((await run(db,"alice","topics_export")).mergeAudit.length,1);
const plan3=await run(db,"alice","topics_merge_preview",ids);await run(db,"alice","topics_merge",{...ids,operationId:"op3",previewDigest:plan3.digest,confirm:true});
const undo3=await run(db,"alice","topics_merge_undo_preview",{operationId:"op3"});beforeBatch=()=>sql.prepare("UPDATE topics SET revision=revision+1 WHERE owner='alice' AND id=?").run(secondary.id);
await assert.rejects(run(db,"alice","topics_merge_undo",{operationId:"op3",previewDigest:undo3.digest,confirm:true}),/Конфликт/);assert.equal((await run(db,"alice","topics_get",{id:primary.id})).topic.revision,4);
await assert.rejects(run(db,"alice","topics_merge_undo_preview",{operationId:"op3"}),/Конфликт/);
// Real backup roundtrip after merge, including archived source/history; audit is export-only.
const backup=await run(db,"alice","topics_export"),backupJson=JSON.stringify(backup);const ip=await run(db,"backup-owner","topics_import_preview",{backupJson});await run(db,"backup-owner","topics_import",{backupJson,previewDigest:ip.digest,confirm:true});assert.deepEqual((await run(db,"backup-owner","topics_export")).topics,backup.topics);assert.equal((await run(db,"backup-owner","topics_export")).mergeAudit.length,0);
const large=(await run(db,"alice","topics_create",{title:"Лимит",summary:"x".repeat(4000)})).topic;await assert.rejects(run(db,"alice","topics_merge_preview",{primaryId:large.id,secondaryId:primary.id}),/длина/);

// A failure after primary data/history changes must roll back the whole batch.
const pa=(await run(db,"alice","topics_create",{title:"Late A",summary:"a"})).topic,pb=(await run(db,"alice","topics_create",{title:"Late B",summary:"b"})).topic;
const lateIds={primaryId:pa.id,secondaryId:pb.id},latePlan=await run(db,"alice","topics_merge_preview",lateIds),lateArgs={...lateIds,operationId:"late",previewDigest:latePlan.digest,confirm:true};
const baselineLate=await run(db,"alice","topics_export");failAt=4;failBatch=true;await assert.rejects(run(db,"alice","topics_merge",lateArgs),/simulated/);failBatch=false;
let afterLate=await run(db,"alice","topics_export");for(const k of ["topics","history","mergeAudit","selected"])assert.deepEqual(afterLate[k],baselineLate[k]);
await run(db,"alice","topics_merge",lateArgs);const lateUndo=await run(db,"alice","topics_merge_undo_preview",{operationId:"late"}),baselineUndo=await run(db,"alice","topics_export");failBatch=true;await assert.rejects(run(db,"alice","topics_merge_undo",{operationId:"late",previewDigest:lateUndo.digest,confirm:true}),/simulated/);failBatch=false;
afterLate=await run(db,"alice","topics_export");for(const k of ["topics","history","mergeAudit","selected"])assert.deepEqual(afterLate[k],baselineUndo[k]);
// Primary races must also block every write.
beforeBatch=()=>sql.prepare("UPDATE topics SET revision=revision+1 WHERE owner='alice' AND id=?").run(pa.id);
await assert.rejects(run(db,"alice","topics_merge_undo",{operationId:"late",previewDigest:lateUndo.digest,confirm:true}),/Конфликт/);assert.equal((await run(db,"alice","topics_get",{id:pb.id})).topic.revision,2);
const pc=(await run(db,"alice","topics_create",{title:"Race A"})).topic,pd=(await run(db,"alice","topics_create",{title:"Race B"})).topic;const raceIds={primaryId:pc.id,secondaryId:pd.id},racePlan=await run(db,"alice","topics_merge_preview",raceIds);
beforeBatch=()=>sql.prepare("UPDATE topics SET revision=revision+1 WHERE owner='alice' AND id=?").run(pc.id);
await assert.rejects(run(db,"alice","topics_merge",{...raceIds,operationId:"primary-race",previewDigest:racePlan.digest,confirm:true}),/Конфликт/);assert.equal((await run(db,"alice","topics_get",{id:pd.id})).topic.revision,1);
// Same request ID used concurrently for different directional plans: only one applies.
const cp1=await run(db,"alice","topics_merge_preview",raceIds),reverse={primaryId:pd.id,secondaryId:pc.id},cp2=await run(db,"alice","topics_merge_preview",reverse);
const races=await Promise.allSettled([run(db,"alice","topics_merge",{...raceIds,operationId:"concurrent",previewDigest:cp1.digest,confirm:true}),run(db,"alice","topics_merge",{...reverse,operationId:"concurrent",previewDigest:cp2.digest,confirm:true})]);assert.equal(races.filter(x=>x.status==="fulfilled").length,1);
const cop=await run(db,"alice","topics_merge_get",{operationId:"concurrent"});assert.equal(cop.state,"applied");for(let i=0;i<2;i++)assert.equal((await run(db,"alice","topics_get",{id:cop.payload.after[i].id})).topic.revision,cop.payload.after[i].revision);
unlinkSync("lib/topics-test.mjs");console.log("PASS merge: preview, field preservation, explicit confirmation, tenant isolation, rollback, replay, atomic conflicts for both topics, undo, history, selection, backup import roundtrip, limits");
