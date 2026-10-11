import test from 'node:test';
import assert from 'node:assert/strict';
import {runEveningAgent} from './agent.mjs';
import {InputError} from './constraints.mjs';
const fixed=()=>({tasks:[
 {id:'lesson',start:'17:30',end:'18:30',transitionMinutes:20,locked:true},
 {id:'routine',start:'18:30',end:'19:00',transitionMinutes:0,locked:true}
]});
const call=(name,schedule)=>({type:'tool_call',name,arguments:schedule});
const scripted=(...names)=>async ({schedule})=>names[0]==='finish'?(names.shift(),{type:'finish'}):call(names.shift(),schedule);

test('synthetic model decisions execute canonical tools and preserve fixed and flexible schedules without applying drafts',async()=>{
 for(const flexible of [false,true]){
  const schedule=fixed();if(flexible)Object.assign(schedule.tasks[1],{locked:false,windowStart:'18:30',windowEnd:'19:30'});
  const before=structuredClone(schedule);
  const result=await runEveningAgent({schedule,decide:scripted('analyze_evening','propose_evening_options','finish')});
  assert.equal(result.status,'complete');assert.equal(result.turns,3);assert.deepEqual(schedule,before);
  assert.deepEqual(result.originalSchedule,before);assert.equal(result.analysis.conflicts[0].shortfallMinutes,20);
  assert.equal(result.proposals.status,flexible?'options_ready':'needs_coordination');
  assert.equal(result.externalActionsPerformed,false);assert.equal(result.requiresUserChoice,flexible);
  if(flexible){assert.equal(result.proposals.options[0].schedule[1].start,'18:50');assert.deepEqual(result.proposals.options[0].schedule[0],before.tasks[0]);}
 }
});
test('a clear evening can finish after analysis without making an unnecessary proposal call',async()=>{
 const schedule=fixed();schedule.tasks[1].start='19:00';schedule.tasks[1].end='19:30';
 const result=await runEveningAgent({schedule,decide:scripted('analyze_evening','finish')});
 assert.equal(result.status,'complete');assert.equal(result.analysis.status,'clear');assert.equal(result.proposals,null);
 assert.equal(result.toolCalls.length,1);assert.equal(result.requiresUserChoice,false);
});
test('unknown tools, premature proposals and model changes to fixed times, flexibility or windows stop safely',async()=>{
 const cases=[
  ['unknown_tool',({schedule})=>call('send_message',schedule)],
  ['analysis_required',({schedule})=>call('propose_evening_options',schedule)],
  ['analysis_required',()=>({type:'finish'})],
  ...[
   task=>{task.start='17:00';},task=>{task.locked=false;task.windowStart='17:00';task.windowEnd='19:00';},
   task=>{task.transitionMinutes=0;}
  ].map(change=>['schedule_changed_by_model',({schedule})=>{change(schedule.tasks[0]);return call('analyze_evening',schedule);}])
 ];
 for(const [code,decide] of cases){const schedule=fixed(),before=structuredClone(schedule);const result=await runEveningAgent({schedule,decide});
  assert.equal(result.code,code);assert.equal(result.status,'stopped');assert.equal(result.toolCalls.length,0);assert.deepEqual(schedule,before);
 }
});
test('model prose, extra fields, malformed JSON and oversized replies are rejected and never echoed',async()=>{
 for(const reply of [
  {type:'finish',text:'SECRET_FAKE calendar has been changed'},
  {type:'tool_call',name:'analyze_evening',arguments:fixed(),command:'SECRET_FAKE'},
  '{SECRET_FAKE',JSON.stringify({type:'finish',text:'SECRET_FAKE'.repeat(1000)})
 ]){
  const result=await runEveningAgent({schedule:fixed(),decide:async()=>reply});
  assert.equal(result.code,'invalid_decision');assert.ok(!JSON.stringify(result).includes('SECRET_FAKE'));
 }
});
test('turn and duplicate-call limits stop loops while preserving verified partial analysis',async()=>{
 const one=await runEveningAgent({schedule:fixed(),maxTurns:1,decide:scripted('analyze_evening')});
 assert.equal(one.code,'turn_limit');assert.equal(one.analysis.status,'conflict');assert.equal(one.proposals,null);
 const repeated=await runEveningAgent({schedule:fixed(),decide:async({schedule})=>call('analyze_evening',schedule)});
 assert.equal(repeated.code,'repeated_tool');assert.equal(repeated.turns,2);assert.equal(repeated.toolCalls.length,1);
});
test('deadline and cancellation abort cooperative adapters and ignore late responses',async()=>{
 let release,adapterSignal;
 const pending=new Promise(resolve=>{release=resolve;});
 const result=await runEveningAgent({schedule:fixed(),timeoutMs:10,decide:({signal})=>{adapterSignal=signal;return pending;}});
 assert.equal(result.code,'model_timeout');assert.equal(adapterSignal.aborted,true);assert.equal(result.toolCalls.length,0);
 release(call('analyze_evening',fixed()));await Promise.resolve();assert.equal(result.toolCalls.length,0);
 const controller=new AbortController();let calls=0;controller.abort();
 const cancelled=await runEveningAgent({schedule:fixed(),signal:controller.signal,decide:()=>{calls++;}});
 assert.equal(cancelled.code,'cancelled');assert.equal(calls,0);
 const active=new AbortController();
 const aborted=await runEveningAgent({schedule:fixed(),signal:active.signal,decide:({signal})=>{
  active.abort();assert.equal(signal.aborted,true);return pending;
 }});
 assert.equal(aborted.code,'cancelled');assert.equal(aborted.toolCalls.length,0);
});
test('context mutation cannot forge facts; provider exceptions are redacted and private input is rejected before a model call',async()=>{
 const result=await runEveningAgent({schedule:fixed(),decide:async({schedule,history})=>{
  if(!history.length)return call('analyze_evening',schedule);
  history[0].result.conflicts=[];history[0].result.status='clear';return {type:'finish'};
 }});
 assert.equal(result.analysis.status,'conflict');assert.equal(result.analysis.conflicts[0].shortfallMinutes,20);
 const failure=await runEveningAgent({schedule:fixed(),decide:()=>{throw new Error('SECRET_FAKE provider diagnostic');}});
 assert.equal(failure.code,'model_error');assert.ok(!JSON.stringify(failure).includes('SECRET_FAKE'));
 let called=false;
 await assert.rejects(()=>runEveningAgent({schedule:{...fixed(),email:'private'},decide:()=>{called=true;}}),InputError);
 assert.equal(called,false);
});
