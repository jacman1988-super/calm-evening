import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {EventEmitter} from 'node:events';
import {createWebHandler} from './web-server.mjs';
const schedule={tasks:[{id:'a',start:'17:30',end:'18:30',transitionMinutes:20,locked:true},{id:'b',start:'18:30',end:'19:00',transitionMinutes:0,locked:true}]};
function call(handler,{path='/api/agent',method='POST',headers={},input={schedule,goal:'options'},raw}={}){
 const req=Readable.from(method==='POST'?[Buffer.from(raw??JSON.stringify(input))]:[]);req.url=path;req.method=method;req.headers={host:'127.0.0.1:8788','content-type':'application/json',...headers};
 const res=new EventEmitter();res.writableEnded=false;res.writeHead=(status,headers)=>{res.status=status;res.headers=headers;};res.end=value=>{res.body=value;res.writableEnded=true;};
 const done=handler(req,res);return {res,done};
}
test('web boundary rejects foreign origins, private runtime paths and profile fields before contacting a model',async()=>{
 let calls=0;const handler=createWebHandler({fetchImpl:async()=>{calls++;throw new Error('never');}});
 for(const [options,status] of [[{headers:{origin:'https://example.com'}},403],[{headers:{host:'other:8788'}},403],[{path:'/.local-ai/desktop-state.json',method:'GET'},404],[{input:{schedule,goal:'options',email:'FAKE_PRIVATE'}},400],[{input:{schedule:{...schedule,email:'FAKE_PRIVATE'},goal:'options'}},400],[{raw:'x'.repeat(9000)},413]]){
  const {res,done}=call(handler,options);await done;assert.equal(res.status,status);assert.ok(!res.body.includes('FAKE_PRIVATE'));
 }
 assert.equal(calls,0);const {res,done}=call(handler,{path:'/',method:'GET'});await done;assert.equal(res.status,200);assert.match(res.headers['Content-Security-Policy'],/connect-src 'self'/);
 assert.match(res.body,/<script defer src="browser-runtime.js"><\/script>/);
 const runtime=call(handler,{path:'/browser-runtime.js',method:'GET'});await runtime.done;assert.equal(runtime.res.status,200);assert.match(runtime.res.headers['Content-Type'],/^text\/javascript/);assert.doesNotMatch(runtime.res.body,/^\s*(?:import|export)\s/m);
});
test('web handler runs the actual engine with mocked model replies and never silently falls back on a provider error',async()=>{
 let index=0;const actions=['analyze_evening','propose_evening_options','finish'];
 const handler=createWebHandler({fetchImpl:async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action:actions[index++]})}}]}))});
 const {res,done}=call(handler);await done;const result=JSON.parse(res.body);assert.equal(result.status,'complete');assert.equal(result.analysis.conflicts[0].shortfallMinutes,20);assert.equal(result.proposals.status,'needs_coordination');assert.equal(result.externalActionsPerformed,false);
 const failed=call(createWebHandler({fetchImpl:async()=>{throw new Error('FAKE_PRIVATE');}}));await failed.done;const stopped=JSON.parse(failed.res.body);assert.equal(stopped.status,'stopped');assert.equal(stopped.code,'model_error');assert.equal(stopped.analysis,null);assert.ok(!failed.res.body.includes('FAKE_PRIVATE'));
});
test('parallel requests are rejected and disconnect cancels inference; subsequent requests can proceed',async()=>{
 let started,signal;const entered=new Promise(resolve=>{started=resolve;});
 const handler=createWebHandler({fetchImpl:async(url,options)=>{signal=options.signal;started();await new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true}));}});
 const first=call(handler);await entered;
 const second=call(handler);await second.done;assert.equal(second.res.status,429);
 first.res.emit('close');await first.done;assert.equal(signal.aborted,true);assert.equal(first.res.body,undefined);
 const invalid=call(handler,{raw:'{'});await invalid.done;assert.equal(invalid.res.status,400);
});
