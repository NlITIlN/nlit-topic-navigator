import {Miniflare} from 'miniflare';import ts from 'typescript';import {readFileSync,readdirSync} from 'node:fs';import assert from 'node:assert/strict';
const js=ts.transpileModule(readFileSync('lib/topics.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;const {run}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const mf=new Miniflare({modules:true,script:'export default {fetch(){return new Response("isolated only")}}',d1Databases:['DB']});
try{const db=await mf.getD1Database('DB');for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){for(const statement of readFileSync('drizzle/'+f,'utf8').split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run()}
const topic=(await run(db,'test','topics_create',{title:'Bindings D1'})).topic;
const binding={kind:'chat',provider:'chatgpt',label:'Test',sourceId:'chat_1'},a={id:topic.id,expectedRevision:1,bindings:[binding]},p=await run(db,'test','topics_bindings_preview',a);
assert.equal((await run(db,'test','topics_get',{id:topic.id})).topic.bindings.length,0);
const b={...a,bindings:[{...binding,sourceId:'chat_2'}]},bp=await run(db,'test','topics_bindings_preview',b);
const race=await Promise.allSettled([run(db,'test','topics_bindings_commit',{...a,previewDigest:p.digest,confirm:true}),run(db,'test','topics_bindings_commit',{...b,previewDigest:bp.digest,confirm:true})]);assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
const actual=(await run(db,'test','topics_get',{id:topic.id})).topic;assert.equal(actual.revision,2);assert.equal(actual.bindings.length,1);
const same={id:topic.id,expectedRevision:2,bindings:actual.bindings},sp=await run(db,'test','topics_bindings_preview',same);assert.equal(sp.changed,false);assert.equal((await run(db,'test','topics_bindings_commit',{...same,previewDigest:sp.digest,confirm:true})).unchanged,true);
const backup=await run(db,'test','topics_export');assert.equal(backup.formatVersion,3);const backupJson=JSON.stringify(backup),ip=await run(db,'restore','topics_import_preview',{backupJson});await run(db,'restore','topics_import',{backupJson,previewDigest:ip.digest,confirm:true});assert.deepEqual((await run(db,'restore','topics_get',{id:topic.id})).topic.bindings,actual.bindings);
await run(db,'restore','topics_restore',{id:topic.id,expectedRevision:2,revision:1});assert.deepEqual((await run(db,'restore','topics_get',{id:topic.id})).topic.bindings,[]);
console.log('PASS real isolated Miniflare D1 bindings: migrations, read-only preview, concurrent CAS, no-op, export3 import and historical restore');
}finally{await mf.dispose()}
