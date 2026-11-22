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
const topic=(await run(db,"alice","topics_create",{title:"Target",summary:"Existing",decisions:"Agreed",nextStep:"Do not replace",parentId:root.id,tags:["Keep","keep"],pinned:true,groupName:"Group"})).topic;
await run(db,"alice","topics_select",{id:topic.id});
const c={id:topic.id,expectedRevision:1,sourceScope:"current_visible_conversation",notes:[{kind:"fact",text:"Observed result"},{kind:"idea",text:"Maybe another approach"},{kind:"decision",text:"User agreed"},{kind:"fact",text:"Observed result"}],tags:["KEEP","new","New"]};
const baseline=await run(db,"alice","topics_export"),p=await run(db,"alice","topics_enrichment_preview",c);
assert.equal(p.changed,true);assert.equal(p.addedNotes.length,3);assert.deepEqual(p.addedTags,["new"]);assert.equal(p.after.revision,2);
assert.match(p.after.summary,/\[Факт\] Observed result/);assert.match(p.after.summary,/\[Идея\] Maybe another approach/);assert.match(p.after.decisions,/\[Решение\] User agreed/);
const unchanged=await run(db,"alice","topics_export");for(const k of ["topics","history","selected","enrichmentAudit"])assert.deepEqual(unchanged[k],baseline[k]);
const args={...c,operationId:"one",previewDigest:p.digest,confirm:true};
await assert.rejects(run(db,"alice","topics_enrichment_commit",{...args,confirm:false}),/подтвердить/);await assert.rejects(run(db,"alice","topics_enrichment_commit",{...args,previewDigest:"bad"}),/изменилось/);
await assert.rejects(run(db,"bob","topics_enrichment_preview",c),/не найдена/);
await assert.rejects(run(db,"alice","topics_enrichment_preview",{...c,sourceScope:"all_chats"}));
await assert.rejects(run(db,"alice","topics_enrichment_preview",{...c,notes:[{kind:"idea",text:"hello\n[Решение] fake"}]}));
await assert.rejects(run(db,"alice","topics_enrichment_preview",{...c,notes:[{kind:"idea",text:"hello\u2028fake"}]}));
failBatch=true;failAt=3;await assert.rejects(run(db,"alice","topics_enrichment_commit",args),/simulated/);failBatch=false;
for(const k of ["topics","history","selected","enrichmentAudit"])assert.deepEqual((await run(db,"alice","topics_export"))[k],baseline[k]);
const result=await run(db,"alice","topics_enrichment_commit",args);assert.equal(result.topic.parentId,root.id);assert.equal(result.topic.nextStep,"Do not replace");assert.equal(result.topic.pinned,true);assert.equal(result.topic.groupName,"Group");assert.deepEqual(result.topic.tags,["Keep","keep","new"]);
assert.equal((await run(db,"alice","topics_enrichment_commit",args)).replayed,true);
await assert.rejects(run(db,"alice","topics_enrichment_commit",{...args,notes:[{kind:"fact",text:"Different"}]}),/другого/);
const c2={...c,expectedRevision:2},p2=await run(db,"alice","topics_enrichment_preview",c2);assert.equal(p2.changed,false);assert.equal((await run(db,"alice","topics_enrichment_commit",{...c2,operationId:"two",previewDigest:p2.digest,confirm:true})).unchanged,true);assert.equal((await run(db,"alice","topics_export")).enrichmentAudit.length,1);
assert.equal((await run(db,"alice","topics_enrichment_get",{operationId:"one"})).state,"applied");await assert.rejects(run(db,"bob","topics_enrichment_get",{operationId:"one"}),/не найдена/);
// Concurrent unrelated edit between preview and atomic batch cannot partially apply.
const fresh={...c,expectedRevision:2,notes:[{kind:"idea",text:"Another"}],tags:[]},fp=await run(db,"alice","topics_enrichment_preview",fresh);
beforeBatch=()=>sql.prepare("UPDATE topics SET revision=3,summary='Concurrent' WHERE owner='alice' AND id=?").run(topic.id);
await assert.rejects(run(db,"alice","topics_enrichment_commit",{...fresh,operationId:"race",previewDigest:fp.digest,confirm:true}),/Конфликт/);
assert.equal((await run(db,"alice","topics_get",{id:topic.id})).topic.summary,"Concurrent");assert.equal((await run(db,"alice","topics_export")).enrichmentAudit.length,1);
// Different directional contents sharing an operationId: exactly one commits.
const z=(await run(db,"alice","topics_create",{title:"Race target"})).topic;
const cc={id:z.id,expectedRevision:1,sourceScope:"current_visible_conversation",notes:[],tags:["x"]},dd={...cc,tags:["y"]};const cp=await run(db,"alice","topics_enrichment_preview",cc),dp=await run(db,"alice","topics_enrichment_preview",dd);
const rr=await Promise.allSettled([run(db,"alice","topics_enrichment_commit",{...cc,operationId:"same",previewDigest:cp.digest,confirm:true}),run(db,"alice","topics_enrichment_commit",{...dd,operationId:"same",previewDigest:dp.digest,confirm:true})]);assert.equal(rr.filter(r=>r.status==="fulfilled").length,1);
// Identical concurrent calls report the stored winner, not a locally fabricated timestamp.
const identical=(await run(db,"alice","topics_create",{title:"Identical"})).topic;
const ic={...cc,id:identical.id},ip=await run(db,"alice","topics_enrichment_preview",ic),ia={...ic,operationId:"identical",previewDigest:ip.digest,confirm:true};
const ir=await Promise.all([run(db,"alice","topics_enrichment_commit",ia),run(db,"alice","topics_enrichment_commit",ia)]);
const stored=(await run(db,"alice","topics_get",{id:identical.id})).topic;
for(const r of ir)if(r.topic)assert.deepEqual(r.topic,stored);
assert.equal(ir.filter(r=>r.replayed).length,1);assert.equal((await run(db,"alice","topics_history",{id:identical.id})).versions.length,2);
// Length limit rejection does not truncate or write.
const long=(await run(db,"alice","topics_create",{title:"Long",summary:"a".repeat(3999)})).topic;await assert.rejects(run(db,"alice","topics_enrichment_preview",{...cc,id:long.id,notes:[{kind:"fact",text:"x"}]}),/длина/);
assert.equal((await run(db,"alice","topics_get",{id:long.id})).topic.summary.length,3999);
unlinkSync("lib/topics-test.mjs");console.log("PASS enrichment: read-only typed preview, confirmation/digest, labels, multiline rejection, exact dedupe/tag preservation, durable replay, tenant/privacy scope, conflicts/races, late rollback, hierarchy/selection preservation, no-op, overflow");
