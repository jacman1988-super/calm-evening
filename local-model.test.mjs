import test from 'node:test';
import assert from 'node:assert/strict';
import {createLocalModelAdapter,localModelReady} from './local-model.mjs';
import {publicTools} from './server.mjs';
const schedule={tasks:[{id:'a',start:'17:30',end:'18:30',transitionMinutes:20,locked:true},{id:'b',start:'18:30',end:'19:00',transitionMinutes:0,locked:true}]};
const completion=(action,extra={})=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({action,...extra})}}]}));
test('adapter limits valid next actions, binds exact input, and sends only compact verified facts',async()=>{
 const bodies=[],decisions=[];let action='analyze_evening';
 const decide=createLocalModelAdapter({fetchImpl:async(url,options)=>{assert.equal(url,'http://127.0.0.1:8790/v1/chat/completions');assert.equal(options.redirect,'error');bodies.push(JSON.parse(options.body));return completion(action);},onDecision:d=>decisions.push(d)});
 const context={schedule,tools:publicTools,history:[],goal:'options'};
 const first=await decide(context);assert.deepEqual(first.arguments,schedule);first.arguments.tasks[0].start='00:00';assert.equal(schedule.tasks[0].start,'17:30');
 action='propose_evening_options';context.history=[{name:'analyze_evening',result:{status:'conflicts',conflicts:[{}]}}];
 await decide(context);assert.deepEqual(bodies[1].response_format.json_schema.schema.properties.action.enum,['propose_evening_options','finish']);
 action='finish';context.history.push({name:'propose_evening_options',result:{status:'needs_coordination',options:[],privateUnneeded:'never_sent'}});
 assert.deepEqual(await decide(context),{type:'finish'});assert.deepEqual(bodies[2].response_format.json_schema.schema.properties.action.enum,['finish']);
 assert.ok(!JSON.stringify(bodies[2]).includes('never_sent'));assert.equal(decisions.length,3);
 context.history=context.history.slice(0,1);context.goal='check';await decide(context);assert.deepEqual(bodies[3].response_format.json_schema.schema.properties.action.enum,['finish']);
});
test('adapter rejects off-policy actions, extra model fields, incomplete and oversized replies',async()=>{
 for(const reply of [completion('finish'),completion('analyze_evening',{command:'delete'}),new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{}'}}]})),new Response('x'.repeat(33000))]){
  const decide=createLocalModelAdapter({fetchImpl:async()=>reply});await assert.rejects(decide({schedule,tools:publicTools,history:[]}));
 }
});
test('model health and completion failures stay bounded and cancellation reaches the provider',async()=>{
 assert.equal(await localModelReady({fetchImpl:async()=>new Response('{}',{status:503})}),false);
 const controller=new AbortController();controller.abort();
 const decide=createLocalModelAdapter({fetchImpl:async(url,options)=>{assert.equal(options.signal,controller.signal);options.signal.throwIfAborted();}});
 await assert.rejects(decide({schedule,tools:publicTools,history:[],signal:controller.signal}),{name:'AbortError'});
});
