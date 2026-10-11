import {isDeepStrictEqual} from 'node:util';
import {analyzeEvening, proposeEveningOptions, InputError, validate} from './constraints.mjs';
import {publicTools, executeLocalTool} from './server.mjs';

const instructions = 'You may call only the supplied read-only tools using the exact supplied schedule. Analyze before proposing options. Never alter fixed times, flexibility windows, durations or transition times. Finish after obtaining facts. Do not claim messages, bookings or calendar changes. Return only {type:"tool_call",name,arguments} or {type:"finish"}; no prose or extra fields.';
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const hasOnly = (value, keys) => record(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value,key));
class Stop extends Error { constructor(code){super(code);this.code=code;} }
const clone = value => structuredClone(value);

async function decideWithinLimit(decide, context, timeoutMs, signal) {
 if(signal?.aborted)throw new Stop('cancelled');
 const controller=new AbortController();let timer,abort;
 const stopped=new Promise((_,reject)=>{
  timer=setTimeout(()=>{controller.abort();reject(new Stop('model_timeout'));},timeoutMs);
  abort=()=>{controller.abort();reject(new Stop('cancelled'));};
  signal?.addEventListener('abort',abort,{once:true});
 });
 try{return await Promise.race([Promise.resolve().then(()=>{
  if(controller.signal.aborted)throw new Stop(signal?.aborted?'cancelled':'model_timeout');
  return decide({...context,signal:controller.signal});
 }),stopped]);}
 catch(error){if(error instanceof Stop)throw error;throw new Stop('model_error');}
 finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
function parseDecision(value) {
 let raw;
 try{
  raw=typeof value==='string'?value:JSON.stringify(value);
  if(typeof raw!=='string'||Buffer.byteLength(raw)>8192)throw new Error();
  value=JSON.parse(raw);
 }catch{throw new Stop('invalid_decision');}
 if(value?.type==='finish'&&hasOnly(value,['type']))return value;
 if(value?.type==='tool_call'&&hasOnly(value,['type','name','arguments'])&&typeof value.name==='string'&&record(value.arguments))return value;
 throw new Stop('invalid_decision');
}
function checkedResult(name, result, original) {
 // Do not trust a result envelope alone: compare to the canonical calculation.
 const expected=name==='analyze_evening'?analyzeEvening(original):proposeEveningOptions(original);
 if(!isDeepStrictEqual(result,expected))throw new Stop('invalid_tool_result');
 return clone(result);
}
function report(history, original, status, code, turns) {
 const analysis=history.find(call=>call.name==='analyze_evening')?.result??null;
 const proposals=history.find(call=>call.name==='propose_evening_options')?.result??null;
 return {status,code,turns,source:'bounded local tool execution; model provider not implied',
  originalSchedule:clone(original),analysis,proposals,toolCalls:clone(history),
  requiresUserChoice:Boolean(proposals?.options?.length),externalActionsPerformed:false,
  notice:'Only verified calculations are shown. No calendar, messages or bookings were changed. Model prose is not displayed.'};
}

/** A trusted provider adapter must implement decide(context). No provider, key,
 * network, automatic fallback model, tools outside this registry, or storage.
 * The adapter is trusted JavaScript, not sandboxed. It must honor AbortSignal;
 * timeouts stop accepting replies but cannot kill non-cooperative adapter code.
 */
export async function runEveningAgent({schedule,decide,goal='options',maxTurns=4,timeoutMs=10000,signal}={}) {
 if(typeof decide!=='function'||!Number.isInteger(maxTurns)||maxTurns<1||maxTurns>6||
    !Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>30000||!['check','options'].includes(goal))throw new InputError('Provide a model adapter, goal and bounded turn/timeout settings.');
 validate(schedule);
 const original=clone(schedule),history=[];let turns=0;
 try{
  for(;turns<maxTurns;){
   turns++;
   const decision=parseDecision(await decideWithinLimit(decide,{instructions,goal,schedule:clone(original),tools:clone(publicTools),history:clone(history)},timeoutMs,signal));
   if(signal?.aborted)throw new Stop('cancelled');
   if(decision.type==='finish'){
    if(!history.some(call=>call.name==='analyze_evening'))throw new Stop('analysis_required');
    return report(history,original,'complete','finished',turns);
   }
   if(!publicTools.some(tool=>tool.name===decision.name))throw new Stop('unknown_tool');
   if(!isDeepStrictEqual(decision.arguments,original))throw new Stop('schedule_changed_by_model');
   if(history.some(call=>call.name===decision.name))throw new Stop('repeated_tool');
   if(decision.name==='propose_evening_options'&&!history.some(call=>call.name==='analyze_evening'))throw new Stop('analysis_required');
   const result=checkedResult(decision.name,executeLocalTool(decision.name,clone(original)),original);
   history.push({name:decision.name,result});
  }
  throw new Stop('turn_limit');
 }catch(error){
  const code=error instanceof Stop?error.code:'tool_error';
  return report(history,original,'stopped',code,turns);
 }
}
