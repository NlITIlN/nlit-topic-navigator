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



const create=async(title,parentId=null)=>(await run(db,"alice","topics_create",{title,parentId})).topic;
const get=async(id)=>(await run(db,"alice","topics_get",{id})).topic;
assert.equal((await get("legacy")).parentId,null);
const root=await create("Root"),child=await create("Child",root.id),leaf=await create("Leaf",child.id),other=await create("Other");
assert.deepEqual((await run(db,"alice","topics_list",{parentId:root.id})).topics.map(t=>t.id),[child.id]);
await run(db,"alice","topics_select",{id:leaf.id});
await assert.rejects(run(db,"alice","topics_update",{id:root.id,expectedRevision:1,parentId:leaf.id}),/cycle/);
await assert.rejects(run(db,"alice","topics_update",{id:root.id,expectedRevision:1,parentId:root.id}),/cycle/);
await assert.rejects(run(db,"bob","topics_create",{title:"Cross owner",parentId:root.id}),/Unknown parent/);
await assert.rejects(run(db,"alice","topics_create",{title:"Missing",parentId:"missing"}),/Unknown parent/);
await run(db,"alice","topics_update",{id:root.id,expectedRevision:1,status:"archived"});
assert.equal((await get(child.id)).parentId,root.id);assert.equal((await get(child.id)).status,"active");assert.equal((await run(db,"alice","topics_list",{parentId:null})).topics.some(t=>t.id===root.id),true);
assert.equal((await run(db,"alice","topics_selected")).selected.id,leaf.id);
await run(db,"alice","topics_update",{id:child.id,expectedRevision:1,parentId:other.id});assert.equal((await get(leaf.id)).parentId,child.id);
await run(db,"alice","topics_restore",{id:child.id,expectedRevision:2,revision:1});assert.equal((await get(child.id)).parentId,root.id);
// Old snapshots without parentId preserve live hierarchy on restore.
sql.prepare("UPDATE topic_history SET snapshot=json_remove(snapshot,'$.parentId') WHERE owner=? AND topic_id=? AND revision=1").run("alice",child.id);
await run(db,"alice","topics_update",{id:child.id,expectedRevision:3,parentId:other.id});await run(db,"alice","topics_restore",{id:child.id,expectedRevision:4,revision:1});assert.equal((await get(child.id)).parentId,other.id);
// Concurrent inverse moves cannot create A->B->A even with stale preliminary reads.
const a=await create("A"),b=await create("B");const concurrent=await Promise.allSettled([run(db,"alice","topics_update",{id:a.id,expectedRevision:1,parentId:b.id}),run(db,"alice","topics_update",{id:b.id,expectedRevision:1,parentId:a.id})]);assert.equal(concurrent.filter(r=>r.status==="fulfilled").length,1);
const ba=await get(a.id),bb=await get(b.id);assert.equal(ba.parentId===b.id&&bb.parentId===a.id,false);
assert.throws(()=>sql.prepare("DELETE FROM topics WHERE owner=? AND id=?").run("alice",other.id),/children/);
// Export order is ID-based, not guaranteed parent-first; importer must reorder.
const backup=await run(db,"alice","topics_export");assert.equal(backup.formatVersion,3);backup.topics.reverse();const backupJson=JSON.stringify(backup),preview=await run(db,"restored","topics_import_preview",{backupJson});
await run(db,"restored","topics_import",{backupJson,previewDigest:preview.digest,confirm:true});const recovered=await run(db,"restored","topics_export");assert.deepEqual(recovered.topics,(await run(db,"alice","topics_export")).topics);assert.equal((await run(db,"restored","topics_import",{backupJson,previewDigest:preview.digest,confirm:true})).added,0);
for(const edit of [x=>{x.topics[0].parentId="absent"},x=>{x.topics[0].parentId=x.topics[0].id},x=>{delete x.topics[0].parentId}]){const x=structuredClone(backup);edit(x);x.history=[];await assert.rejects(run(db,"fresh","topics_import_preview",{backupJson:JSON.stringify(x)}))}
// Skipped IDs use real parents. File trying to root a skipped parent cannot disguise a cycle.
const effective=structuredClone(backup);effective.history=[];const liveParent=await create("Existing"),missing={...effective.topics[0],id:"new-child",parentId:liveParent.id};
// existing cannot point at missing by trigger; unknown ancestors in histories are okay until explicit restore.
const orphanHistory={...missing,parentId:"historical-missing",revision:1};missing.revision=2;const historical={format:"nlit-topics-export",formatVersion:2,topics:[missing],history:[{topicId:missing.id,revision:1,snapshot:orphanHistory,recordedAt:missing.updatedAt}]};const hj=JSON.stringify(historical),hp=await run(db,"alice","topics_import_preview",{backupJson:hj});await run(db,"alice","topics_import",{backupJson:hj,previewDigest:hp.digest,confirm:true});await assert.rejects(run(db,"alice","topics_restore",{id:missing.id,expectedRevision:2,revision:1}),/Unknown parent/);assert.equal((await get(missing.id)).parentId,liveParent.id);
// Merge does not reparent children; undo preserves links; changing parent blocks undo.
const m=await create("M"),n=await create("N",other.id),nc=await create("NC",n.id),pair={primaryId:m.id,secondaryId:n.id};const mp=await run(db,"alice","topics_merge_preview",pair);await run(db,"alice","topics_merge",{...pair,operationId:"tree-merge",previewDigest:mp.digest,confirm:true});assert.equal((await get(nc.id)).parentId,n.id);assert.equal((await get(n.id)).parentId,other.id);
const up=await run(db,"alice","topics_merge_undo_preview",{operationId:"tree-merge"});await run(db,"alice","topics_merge_undo",{operationId:"tree-merge",previewDigest:up.digest,confirm:true});assert.equal((await get(n.id)).parentId,other.id);
const mp2=await run(db,"alice","topics_merge_preview",pair);await run(db,"alice","topics_merge",{...pair,operationId:"tree-merge-2",previewDigest:mp2.digest,confirm:true});const mt=await get(m.id);await run(db,"alice","topics_update",{id:m.id,expectedRevision:mt.revision,parentId:other.id});await assert.rejects(run(db,"alice","topics_merge_undo_preview",{operationId:"tree-merge-2"}),/Конфликт/);
// Legacy merge payload omits hierarchy: preserve known current parent in undo AND history.
const oldP=await create("OldP",other.id),oldS=await create("OldS",other.id),oldPair={primaryId:oldP.id,secondaryId:oldS.id};const oldPlan=await run(db,"alice","topics_merge_preview",oldPair);await run(db,"alice","topics_merge",{...oldPair,operationId:"legacy-op",previewDigest:oldPlan.digest,confirm:true});
const opRow=sql.prepare("SELECT payload FROM topic_merges WHERE owner='alice' AND id='legacy-op'").get();const oldPayload=JSON.parse(opRow.payload);for(const list of [oldPayload.before,oldPayload.after])for(const t of list)delete t.parentId;sql.prepare("UPDATE topic_merges SET payload=? WHERE owner='alice' AND id='legacy-op'").run(JSON.stringify(oldPayload));
const oldUndo=await run(db,"alice","topics_merge_undo_preview",{operationId:"legacy-op"});assert.equal(oldUndo.after[0].parentId,other.id);await run(db,"alice","topics_merge_undo",{operationId:"legacy-op",previewDigest:oldUndo.digest,confirm:true});assert.equal((await get(oldP.id)).parentId,other.id);const oldHistory=await run(db,"alice","topics_history",{id:oldP.id});assert.equal(oldHistory.versions[0].topic.parentId,other.id);
const fullCopy=JSON.stringify(await run(db,"alice","topics_export"));await run(db,"new-copy","topics_import_preview",{backupJson:fullCopy});
// Legacy v1 import becomes roots; explicit v1 hierarchy rejected.
const legacy={format:"nlit-topics-export",formatVersion:1,topics:[{...missing,id:"legacy-import",parentId:null}],history:[]};delete legacy.topics[0].parentId;const lj=JSON.stringify(legacy),lp=await run(db,"alice","topics_import_preview",{backupJson:lj});await run(db,"alice","topics_import",{backupJson:lj,previewDigest:lp.digest,confirm:true});assert.equal((await get("legacy-import")).parentId,null);
unlinkSync("lib/topics-test.mjs");console.log("PASS subtopics: migration, parent filtering, cross-owner/missing/self/cycle rejection, concurrent inverse moves, archive and selection preservation, move/history/legacy restore, v1/v2 import hierarchy, merge/undo links");
