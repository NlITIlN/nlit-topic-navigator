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


const root=(await run(db,"alice","topics_create",{title:"Root"})).topic;
const topic=(await run(db,"alice","topics_create",{title:"Target",summary:"Keep",parentId:root.id,sources:[{label:"Legacy",url:"https://example.com/doc"}]})).topic;
await run(db,"alice","topics_select",{id:topic.id});
const bindings=[{kind:"chat",provider:"chatgpt",label:"Our chat",url:"https://CHATGPT.com/c/example/"},{kind:"project",provider:"codex",label:"Project",sourceId:"project_123"}];
const args={id:topic.id,expectedRevision:1,bindings};const before=await run(db,"alice","topics_export"),p=await run(db,"alice","topics_bindings_preview",args);assert.equal(p.after.bindings[0].url,"https://chatgpt.com/c/example/");assert.equal(p.added.length,2);assert.equal(p.removed.length,0);
for(const key of ["topics","history","selected"])assert.deepEqual((await run(db,"alice","topics_export"))[key],before[key]);
await assert.rejects(run(db,"bob","topics_bindings_preview",args),/не найдена/);
await assert.rejects(run(db,"alice","topics_bindings_commit",{...args,previewDigest:p.digest}),/подтверди/);
await assert.rejects(run(db,"alice","topics_bindings_commit",{...args,previewDigest:"bad",confirm:true}),/подтверди/);
failBatch=true;failAt=2;await assert.rejects(run(db,"alice","topics_bindings_commit",{...args,previewDigest:p.digest,confirm:true}),/simulated/);failBatch=false;assert.deepEqual((await run(db,"alice","topics_export")).topics,before.topics);
let result=await run(db,"alice","topics_bindings_commit",{...args,previewDigest:p.digest,confirm:true});assert.deepEqual(result.topic.bindings,p.after.bindings);assert.deepEqual(result.topic.sources,topic.sources);assert.equal(result.topic.parentId,root.id);
await assert.rejects(run(db,"alice","topics_bindings_commit",{...args,previewDigest:p.digest,confirm:true}),/Конфликт/);
const repeat={...args,expectedRevision:2},rp=await run(db,"alice","topics_bindings_preview",repeat);assert.equal(rp.changed,false);assert.equal((await run(db,"alice","topics_bindings_commit",{...repeat,previewDigest:rp.digest,confirm:true})).unchanged,true);assert.equal((await run(db,"alice","topics_get",{id:topic.id})).topic.revision,2);
await run(db,"alice","topics_update",{id:topic.id,expectedRevision:2,summary:"Edited"});assert.deepEqual((await run(db,"alice","topics_get",{id:topic.id})).topic.bindings,p.after.bindings);
for(const url of ["http://example.com/a","https://a:b@example.com/a","https://example.com/a?token=x","https://example.com/%0Aevil","https://example.com/a#token","https://localhost/x","https://127.0.0.1/x","https://0x7f000001/x","https://example.com:8443/x","https://example.com/\nfoo"]){await assert.rejects(run(db,"alice","topics_bindings_preview",{id:topic.id,expectedRevision:3,bindings:[{kind:"chat",provider:"other",label:"Bad",url}]}))}
for(const binding of [{kind:"chat",provider:"chatgpt",label:"Bad",url:"https://example.com/c/x"},{kind:"chat",provider:"codex",label:"Bad",url:"https://chatgpt.com/c/x",sourceId:"x"},{kind:"project",provider:"other",label:"Bad"},{kind:"chat",provider:"chatgpt",label:"Bad",sourceId:"contains a password"},{kind:"chat",provider:"other",label:"bad\u2028label",sourceId:"id"}])await assert.rejects(run(db,"alice","topics_bindings_preview",{id:topic.id,expectedRevision:3,bindings:[binding]}));
await assert.rejects(run(db,"alice","topics_bindings_preview",{id:topic.id,expectedRevision:3,bindings:[bindings[0],{...bindings[0],url:"https://chatgpt.com/c/example/",label:"Different"}]}),/Повтор/);
const russian=await run(db,"alice","topics_bindings_preview",{id:topic.id,expectedRevision:3,bindings:[{kind:"project",provider:"other",label:"Русский путь",url:"https://example.com/%D0%BF%D1%80%D0%BE%D0%B5%D0%BA%D1%82"}]});assert.equal(russian.added.length,1);
// Legacy snapshots lacking bindings preserve them on restore.
sql.prepare("UPDATE topic_history SET snapshot=json_remove(snapshot,'$.bindings') WHERE owner=? AND topic_id=? AND revision=1").run("alice",topic.id);
await run(db,"alice","topics_restore",{id:topic.id,expectedRevision:3,revision:1});assert.deepEqual((await run(db,"alice","topics_get",{id:topic.id})).topic.bindings,p.after.bindings);
const secondary=(await run(db,"alice","topics_create",{title:"Other",bindings:[{kind:"project",provider:"other",label:"External",url:"https://example.com/project"}]})).topic;
const pair={primaryId:topic.id,secondaryId:secondary.id},mp=await run(db,"alice","topics_merge_preview",pair);assert.equal(mp.after[0].bindings.length,3);await run(db,"alice","topics_merge",{...pair,operationId:"merge-bindings",previewDigest:mp.digest,confirm:true});
const up=await run(db,"alice","topics_merge_undo_preview",{operationId:"merge-bindings"});await run(db,"alice","topics_merge_undo",{operationId:"merge-bindings",previewDigest:up.digest,confirm:true});assert.equal((await run(db,"alice","topics_get",{id:topic.id})).topic.bindings.length,2);
// Legacy merge snapshots without bindings keep the current typed links in preview, rows and new snapshots.
const lp=await run(db,"alice","topics_merge_preview",pair);await run(db,"alice","topics_merge",{...pair,operationId:"legacy-bindings",previewDigest:lp.digest,confirm:true});
const row=sql.prepare("SELECT payload FROM topic_merges WHERE owner='alice' AND id='legacy-bindings'").get(),legacyPayload=JSON.parse(row.payload);for(const list of [legacyPayload.before,legacyPayload.after])for(const t of list)delete t.bindings;
sql.prepare("UPDATE topic_merges SET payload=? WHERE owner='alice' AND id='legacy-bindings'").run(JSON.stringify(legacyPayload));const lup=await run(db,"alice","topics_merge_undo_preview",{operationId:"legacy-bindings"});assert.equal(lup.after[0].bindings.length,3);await run(db,"alice","topics_merge_undo",{operationId:"legacy-bindings",previewDigest:lup.digest,confirm:true});
const kept=(await run(db,"alice","topics_get",{id:topic.id})).topic.bindings;assert.equal(kept.length,3);
const conflictA=(await run(db,"alice","topics_create",{title:"A",bindings:[{kind:"chat",provider:"chatgpt",label:"First",sourceId:"same"}]})).topic;
const conflictB=(await run(db,"alice","topics_create",{title:"B",bindings:[{kind:"chat",provider:"chatgpt",label:"Second",sourceId:"same"}]})).topic;
await assert.rejects(run(db,"alice","topics_merge_preview",{primaryId:conflictA.id,secondaryId:conflictB.id}),/Конфликт подписей/);await assert.rejects(run(db,"alice","topics_merge_preview",{primaryId:conflictB.id,secondaryId:conflictA.id}),/Конфликт подписей/);
// Export3/import retains typed links, sources and hierarchy; old formats cannot carry nonempty bindings.
const backup=await run(db,"alice","topics_export");assert.equal(backup.formatVersion,3);const backupJson=JSON.stringify(backup),ip=await run(db,"restored","topics_import_preview",{backupJson});await run(db,"restored","topics_import",{backupJson,previewDigest:ip.digest,confirm:true});assert.deepEqual((await run(db,"restored","topics_get",{id:topic.id})).topic.bindings,kept);
await assert.rejects(run(db,"restored","topics_import_preview",{backupJson:JSON.stringify({...backup,formatVersion:2})}),/формат 3/);
const missing=structuredClone(backup);delete missing.topics[0].bindings;await assert.rejects(run(db,"alice","topics_import_preview",{backupJson:JSON.stringify(missing)}),/обязательны/);
// CAS conflict between preview and batch cannot replace bindings.
const current=(await run(db,"alice","topics_get",{id:topic.id})).topic;const clear={id:topic.id,expectedRevision:current.revision,bindings:[]},cp=await run(db,"alice","topics_bindings_preview",clear);assert.equal(cp.removed.length,3);
beforeBatch=()=>sql.prepare("UPDATE topics SET revision=revision+1 WHERE owner='alice' AND id=?").run(topic.id);await assert.rejects(run(db,"alice","topics_bindings_commit",{...clear,previewDigest:cp.digest,confirm:true}),/Конфликт/);assert.equal((await run(db,"alice","topics_get",{id:topic.id})).topic.bindings.length,3);
assert.equal((await run(db,"alice","topics_selected")).selected.id,topic.id);
unlinkSync("lib/topics-test.mjs");console.log("PASS bindings: typed preview/no-write, confirmation/digest, normalization/no-op, stale+atomic conflicts, unsafe/credential URLs, duplicates, tenant isolation, legacy fields/history, merge/undo, export3 roundtrip, hierarchy/selection preservation");
