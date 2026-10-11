import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {startLocalApp} from './start-local.mjs';
const app=await startLocalApp();
let verified=false;
try{
 const fixed={tasks:[{id:'lesson',start:'17:30',end:'18:30',transitionMinutes:20,locked:true},{id:'routine',start:'18:30',end:'19:00',transitionMinutes:0,locked:true}]};
 const flexible=structuredClone(fixed);Object.assign(flexible.tasks[1],{locked:false,windowStart:'18:30',windowEnd:'19:30'});
 const clear=structuredClone(fixed);Object.assign(clear.tasks[1],{start:'19:00',end:'19:30'});
 const cases=[];
 for(const [name,schedule] of [['fixed',fixed],['flexible',flexible],['clear',clear]]){
  console.log(`Checking real local AI: ${name}`);
  const response=await fetch(app.origin+'/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schedule,goal:'options'}),signal:AbortSignal.timeout(125000)});
  assert.equal(response.status,200);const result=await response.json();
  assert.equal(result.status,'complete',JSON.stringify({code:result.code,modelDecisions:result.modelDecisions}));
  assert.equal(result.externalActionsPerformed,false);assert.deepEqual(result.originalSchedule,schedule);assert.ok(result.modelDecisions.length>=2);
  if(name==='fixed')assert.equal(result.proposals?.status,'needs_coordination');
  if(name==='flexible'){assert.equal(result.proposals?.status,'options_ready');assert.equal(result.proposals.options[0].schedule[1].start,'18:50');assert.deepEqual(result.proposals.options[0].schedule[0],fixed.tasks[0]);}
  if(name==='clear'){assert.equal(result.analysis.status,'clear');assert.ok(result.proposals===null||result.proposals.status==='already_clear');}
  cases.push({name,result});
 }
 const rpc=async(message,headers={})=>fetch(app.origin+'/mcp',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers},body:JSON.stringify(message)});
 const init=await rpc({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'calm-evening-live-check',version:'1'}}});
 assert.equal(init.status,200);const session=init.headers.get('MCP-Session-Id');assert.ok(session);
 const headers={'MCP-Session-Id':session,'MCP-Protocol-Version':'2025-11-25'};
 assert.equal((await rpc({jsonrpc:'2.0',method:'notifications/initialized'},headers)).status,202);
 const discovery=await (await rpc({jsonrpc:'2.0',id:2,method:'tools/list'},headers)).json();assert.equal(discovery.result.tools.length,2);
 const tool=await (await rpc({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'analyze_evening',arguments:fixed}},headers)).json();assert.equal(tool.result.structuredContent.conflicts[0].shortfallMinutes,20);
 assert.equal((await fetch(app.origin+'/mcp',{method:'DELETE',headers})).status,200);
 const evidence={verifiedAtUtc:new Date().toISOString(),evidenceType:'actual local Qwen3-1.7B Q8_0 inference through llama.cpp b11552 and HTTP; fictional inputs',modelLive:true,httpVerified:true,mcpRpcClientVerified:true,alexaConnected:false,browserVerified:false,cases,mcp:{protocolVersion:'2025-11-25',initialized:true,discovery:true,calculation:true,sessionClosed:true,officialSdkClient:false}};
 await writeFile(new URL('live-evidence.json',import.meta.url),JSON.stringify(evidence,null,2)+'\n');verified=true;
 console.log('PASS: 3 actual model cases and real HTTP/MCP lifecycle. Evidence saved; no Alexa/browser claim.');
}finally{
 if(!verified||!process.argv.includes('--keep-running'))await app.stop();
 else{console.log(`Preview remains running at ${app.origin}/`);for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.stop();process.exit(0);});}
}
