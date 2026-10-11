import {writeFile} from 'node:fs/promises';
import {runEveningAgent} from './agent.mjs';
const fixed={tasks:[
 {id:'lesson',start:'17:30',end:'18:30',transitionMinutes:20,locked:true},
 {id:'routine',start:'18:30',end:'19:00',transitionMinutes:0,locked:true}
]};
// Synthetic decision function: an execution harness, never a real AI demo.
const syntheticDecide=async ({schedule,history})=>{
 if(!history.length)return {type:'tool_call',name:'analyze_evening',arguments:schedule};
 if(history[0].result.status==='conflict'&&history.length===1)return {type:'tool_call',name:'propose_evening_options',arguments:schedule};
 return {type:'finish'};
};
const flexible=structuredClone(fixed);
Object.assign(flexible.tasks[1],{locked:false,windowStart:'18:30',windowEnd:'19:30'});
const result={evidenceType:'synthetic decision harness; no AI/model/Alexa/network',
 cases:[await runEveningAgent({schedule:fixed,decide:syntheticDecide}),await runEveningAgent({schedule:flexible,decide:syntheticDecide})]};
await writeFile(new URL('agent-smoke-output.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log('Saved synthetic execution evidence; no model or network was used.');
