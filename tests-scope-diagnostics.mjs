import {readFileSync} from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
let source=readFileSync('lib/server.ts','utf8').replace('import {run,tools} from "./topics";','const tools=[]; const run=async()=>{throw Error("Storage route must not execute")};').replace('import html from "./view.html?raw";','const html="test";');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {handleTopics}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function call({meta,args={},owner='alice',api=false,extra={}}={}){
 const params={name:'topics_scope_diagnostics',arguments:args,...(meta===undefined?{}:{_meta:meta})};
 const b=api?{...params,...extra}:{jsonrpc:'2.0',id:1,method:'tools/call',params,...extra};
 const r=await handleTopics(new Request('https://example.test/'+(api?'api/topics':'mcp'),{method:'POST',headers:owner?{'oai-authenticated-user-id':owner}:{},body:JSON.stringify(b)}),{get DB(){throw Error('Legacy DB touched')},get CHAT_DB(){throw Error('Chat DB touched')}});
 return {status:r.status,body:await r.json()};
}
const data=r=>r.body.result.structuredContent;
const valid=data(await call({meta:{'openai/session':'session-abc'}}));
assert.equal(valid.status,'valid_format');assert.match(valid.fingerprint,/^[a-f0-9]{64}$/);assert.equal(valid.catalogRouting,'confirmed_chat');
assert.equal(JSON.stringify(valid).includes('session-abc'),false);assert.equal(JSON.stringify(valid).includes('alice'),false);
assert.equal(data(await call({meta:{'openai/session':'session-abc'}})).fingerprint,valid.fingerprint);
assert.notEqual(data(await call({owner:'bob',meta:{'openai/session':'session-abc'}})).fingerprint,valid.fingerprint);
assert.notEqual(data(await call({meta:{'openai/session':'different'}})).fingerprint,valid.fingerprint);
for(const value of [null,[],{},1,true]){const d=data(await call({meta:{'openai/session':value}}));assert.equal(d.status,'unsupported_type');assert.equal(d.fingerprint,null);}
for(const value of ['', ' x','x ', 'a b','a\n','x\u2028y','x\u0085y','x'.repeat(513)]){const d=data(await call({meta:{'openai/session':value}}));assert.equal(d.status,'invalid_format');assert.equal(d.fingerprint,null);}
assert.equal(data(await call({meta:{'openai/session':'x'.repeat(512)}})).validFormat,true);
for(const meta of [undefined,null,[],{},'spoof'])assert.equal(data(await call({meta})).status,'unavailable');
const spoof={_meta:{'openai/session':'spoof-secret'},session:'spoof-secret',owner:'victim'};
assert.equal(data(await call({args:spoof,extra:{_meta:spoof._meta}})).status,'unavailable');
assert.equal(data(await call({args:spoof,meta:{'openai/session':'session-abc'}})).fingerprint,valid.fingerprint);
const api=await call({api:true,meta:{'openai/session':'session-abc'},args:spoof});assert.equal(api.body.status,'unavailable');assert.equal(api.body.transport,'api');
assert.equal((await call({owner:'',meta:{'openai/session':'secret'}})).body.result.isError,true);
assert.equal((await call({owner:'',api:true})).status,401);
console.log('PASS scope diagnostics: server params metadata only, no DB, owner bound hash, no raw values, unsupported/missing/malformed boundaries, argument spoof ignored, API unavailable, auth gate');
