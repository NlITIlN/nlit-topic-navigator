import {run,tools} from "./topics";
import html from "./view.html?raw";
const json=(data:any,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
// Diagnostic only: transport metadata is not authorization or a verified chat ID.
async function scopeDiagnostics(owner:string,meta:unknown,transport:"mcp"|"api"){
 if(!owner)throw Error("Требуется вход в ChatGPT");
 const container=meta!==null&&typeof meta==="object"&&!Array.isArray(meta);
 const present=transport==="mcp"&&container&&Object.prototype.hasOwnProperty.call(meta,"openai/session");
 const value=present?(meta as Record<string,unknown>)["openai/session"]:undefined;
 const valueType=!present?"missing":value===null?"null":Array.isArray(value)?"array":typeof value;
 const valid=present&&typeof value==="string"&&value.length>0&&value.length<=512&&value.trim()===value&&!/[\s\u0000-\u001f\u007f-\u009f\u2028\u2029]/.test(value);
 const status=!present?"unavailable":valueType!=="string"?"unsupported_type":valid?"valid_format":"invalid_format";
 let fingerprint:string|null=null;
 if(valid){const bytes=new TextEncoder().encode(JSON.stringify(["nlit-scope-probe-v1",owner,value]));fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),x=>x.toString(16).padStart(2,"0")).join("");}
 return {transport,metadataPresent:!!present,valueType,status,validFormat:!!valid,fingerprint,algorithm:fingerprint?"SHA-256 owner-bound v1":null,isolated:false,catalogRouting:"account",notice:"Только диагностика формата метаданных запроса. Это не подтверждённый ID чата и не авторизация; маршрутизация каталога и сохранённого выбора не меняется. Отсутствие метаданных не доказывает отсутствие поддержки. Отпечаток не является секретом или разрешением доступа."};
}
export async function handleTopics(request:Request,env:any):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname;
 if(!["/","/mcp","/api/topics"].includes(path))return null;
 const owner=request.headers.get("oai-authenticated-user-id");
 if(path==="/")return new Response(html,{headers:{"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:; base-uri 'none'; form-action 'none'"}});
 if(request.method!=="POST")return json({error:"Method not allowed"},405);
 if(Number(request.headers.get("content-length")||0)>256000)return json({error:"Слишком большой запрос"},413);
 if(path==="/api/topics"&&request.headers.get("origin")&&request.headers.get("origin")!==url.origin)return json({error:"Недопустимый источник"},403);
 let b:any;try{const text=await request.text();if(text.length>256000)throw Error();b=JSON.parse(text)}catch{return json({error:"Неверный JSON"},400)}
 if(path==="/api/topics"){if(!owner)return json({error:"Войди в ChatGPT, чтобы открыть темы."},401);try{return json(b.name==="topics_scope_diagnostics"?await scopeDiagnostics(owner,undefined,"api"):await run(env.DB,owner,b.name,b.arguments))}catch(e){return json({error:(e as Error).message},400)}}
 if(b.id===undefined)return new Response(null,{status:202});
 const versions=["2026-07-28","2025-11-25"];
 const cacheable=["server/discover","tools/list","resources/list","resources/read"].includes(b.method);
 const reply=(result:any)=>json({jsonrpc:"2.0",id:b.id,result:{resultType:"complete",...(cacheable?{ttlMs:0,cacheScope:"private"}:{}),...result}});
 if(b.method==="server/discover")return reply({supportedVersions:versions,capabilities:{tools:{},resources:{}}});
 if(b.method==="initialize")return reply({protocolVersion:"2025-11-25",capabilities:{tools:{},resources:{}},serverInfo:{name:"nlit-topic-navigator",version:"1.8.1"}});
 if(b.method==="ping")return reply({});
 if(b.method==="tools/list")return reply({tools});
 if(b.method==="resources/list")return reply({resources:[{uri:"ui://nlit/topics",name:"Навигатор тем",mimeType:"text/html;profile=mcp-app"}]});
 if(b.method==="resources/read"&&b.params?.uri==="ui://nlit/topics")return reply({contents:[{uri:"ui://nlit/topics",mimeType:"text/html;profile=mcp-app",text:html,_meta:{ui:{prefersBorder:true,csp:{connectDomains:[],resourceDomains:[]}},"openai/ui":{availableDisplayModes:["inline","fullscreen"],preferredDisplayMode:"fullscreen"}}}]});
 if(b.method==="tools/call"){try{const data=b.params?.name==="topics_scope_diagnostics"?await scopeDiagnostics(owner||"",b.params?._meta,"mcp"):await run(env.DB,owner||"",b.params?.name,b.params?.arguments);return reply({structuredContent:data,content:[{type:"text",text:JSON.stringify(data)}]})}catch(e){return reply({isError:true,content:[{type:"text",text:(e as Error).message}]})}}
 return json({jsonrpc:"2.0",id:b.id,error:{code:-32601,message:"Method not found"}});
}
