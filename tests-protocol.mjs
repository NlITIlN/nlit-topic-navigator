import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
// Execute the actual handler, replacing only storage and raw HTML imports.
let source=readFileSync('lib/server.ts','utf8').replace('import {run,tools} from "./topics";','const tools=[]; const run=async()=>({topics:[]});').replace('import html from "./view.html?raw";','const html="<html>test</html>";');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {handleTopics}=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
async function request(method,params={},headers={}){const response=await handleTopics(new Request('https://example.test/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})}),{});return {status:response.status,body:await response.json()};}
const modern={'io.modelcontextprotocol/protocolVersion':'2026-07-28','io.modelcontextprotocol/clientCapabilities':{}};
for(const mode of ['legacy','modern']){
 for(const method of ['server/discover','tools/list','resources/list','resources/read','tools/call','ping']){
  const {body,status}=await request(method,{uri:'ui://nlit/topics',name:'topics_list',...(mode==='modern'?{_meta:modern}:{})},mode==='modern'?{'MCP-Protocol-Version':'2026-07-28'}:{});
  assert.equal(status,200);assert.equal(body.result.resultType,'complete');
  if(['server/discover','tools/list','resources/list','resources/read'].includes(method)){assert.equal(body.result.ttlMs,0);assert.equal(body.result.cacheScope,'private');}
 }
}
// Compatibility: the repair does not introduce stricter inbound rejection
// before the actual Sites wrapper's wire behavior has been verified.
assert.equal((await request('ping',{}, {'MCP-Protocol-Version':'2026-07-28'})).status,200);
assert.equal((await request('initialize')).body.result.protocolVersion,'2025-11-25');
// Test the real transport, not the previous suite's RPC replacement.
const html=readFileSync('lib/view.html','utf8'), script=html.match(/<script>([\s\S]*)<\/script>/)[1];
const transport=script.slice(script.indexOf('function rpc('),script.indexOf('function styleHost'));
let listener;const sent=[],timers=new Map();let timer=1;
const parent={postMessage:(message,origin)=>sent.push({message,origin})};
const ctx={parent,window:{addEventListener:(_,fn)=>listener=fn},Map,Promise,Error,setTimeout(fn){timers.set(timer,fn);return timer++},clearTimeout(id){timers.delete(id)},applyHost(){}};
vm.createContext(ctx);vm.runInContext('let rpcId=1,pending=new Map(),hostOrigin=null;'+transport,ctx);
const receive=m=>listener({source:parent,origin:'https://chatgpt.com',data:m});
const promise=vm.runInContext('rpc("ui/initialize",{})',ctx);
const id=sent[0].message.id;
receive({jsonrpc:'2.0',id,method:'ping'});
assert.equal(vm.runInContext('pending.size',ctx),1);assert.deepEqual(JSON.parse(JSON.stringify(sent[1].message)),{jsonrpc:'2.0',id,result:{}});
receive({jsonrpc:'2.0',id,method:'unknown'});
assert.equal(vm.runInContext('pending.size',ctx),1);assert.equal(sent[2].message.error.code,-32601);
receive({jsonrpc:'2.0',id});assert.equal(vm.runInContext('pending.size',ctx),1);
receive({jsonrpc:'2.0',id,result:{},error:{code:1,message:'bad'}});assert.equal(vm.runInContext('pending.size',ctx),1);
receive({jsonrpc:'2.0',id,result:{hostCapabilities:{}}});
assert.deepEqual(JSON.parse(JSON.stringify(await promise)),{hostCapabilities:{}});
const second=vm.runInContext('rpc("tools/call",{})',ctx);const id2=sent.at(-1).message.id;
listener({source:parent,origin:'https://evil.test',data:{jsonrpc:'2.0',id:id2,result:{}}});
assert.equal(vm.runInContext('pending.size',ctx),1);
receive({jsonrpc:'2.0',id:id2,error:{code:-32601,message:'not found'}});
await assert.rejects(second,/not found/);
assert.equal(timers.size,0);
console.log('PASS real server protocol result fields/legacy compatibility and real UI transport ping, colliding IDs, malformed replies, errors, origin binding');
