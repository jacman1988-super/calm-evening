const endpoint='http://127.0.0.1:8790';
async function boundedJson(response){
 if(!response.ok)throw new Error(`Local model HTTP ${response.status}.`);
 let length=0;const parts=[];
 for await(const chunk of response.body){length+=chunk.length;if(length>32768)throw new Error('Local model response too large.');parts.push(chunk);}
 return JSON.parse(Buffer.concat(parts).toString('utf8'));
}
export async function localModelReady({fetchImpl=fetch,signal}={}){
 try{const response=await fetchImpl(endpoint+'/health',{signal:signal??AbortSignal.timeout(1500),redirect:'error'});return (await boundedJson(response)).status==='ok';}catch{return false;}
}
export function createLocalModelAdapter({fetchImpl=fetch,onDecision=()=>{}}={}){
 return async({schedule,tools,history,goal='options',signal})=>{
  const started=Date.now();
  const used=new Set(history.map(call=>call.name));
  const actions=used.has('analyze_evening')?[...tools.filter(tool=>!used.has(tool.name)&&goal==='options').map(tool=>tool.name),'finish']:['analyze_evening'];
  const actionSchema={type:'object',additionalProperties:false,required:['action'],properties:{action:{type:'string',enum:actions}}};
  const system='You are a careful evening-planning assistant. Choose the next read-only tool, or finish. First analyze_evening. Use propose_evening_options after analysis when conflicts exist and the user wants options. Finish when enough verified facts are available. Each tool may run only once. Preserve fixed commitments and explicit flexibility. Return only JSON with one action; no prose. The server binds the selected tool to the exact user schedule.';
  // The model chooses workflow actions, not candidate times; full drafts remain
  // in the verified tool report. Keep context bounded even for eight tasks.
  const facts=history.map(({name,result})=>({name,status:result.status,conflictCount:result.conflicts?.length,optionCount:result.options?.length,requiresUserChoice:result.requiresUserChoice}));
  const body={model:'calm-evening-local',messages:[{role:'system',content:system},{role:'user',content:JSON.stringify({goal,schedule,allowedActions:actions,availableTools:tools.filter(tool=>actions.includes(tool.name)).map(({name,description})=>({name,description})),verifiedToolResults:facts})}],
   stream:false,temperature:0,max_tokens:80,chat_template_kwargs:{enable_thinking:false},response_format:{type:'json_schema',json_schema:{name:'evening_action',strict:true,schema:actionSchema}}};
  const response=await fetchImpl(endpoint+'/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal,redirect:'error'});
  const completion=await boundedJson(response),choice=completion.choices?.[0];
  if(completion.choices?.length!==1||choice?.finish_reason!=='stop'||typeof choice.message?.content!=='string')throw new Error('Invalid local model completion.');
  const value=JSON.parse(choice.message.content);
  if(!value||Array.isArray(value)||Object.keys(value).length!==1||!Object.hasOwn(value,'action')||!actionSchema.properties.action.enum.includes(value.action))throw new Error('Invalid local model action.');
  onDecision({action:value.action,provider:'llama.cpp on this computer',elapsedMs:Date.now()-started});
  return value.action==='finish'?{type:'finish'}:{type:'tool_call',name:value.action,arguments:structuredClone(schedule)};
 };
}
