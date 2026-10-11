import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class Element{
 constructor(){this.children=[];this.handlers={};this.value='options';}
 addEventListener(type,handler){this.handlers[type]=handler;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 fire(type){return this.handlers[type]?.();}
}
async function fixture(){
 const elements=new Map(),get=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const pending=[],rendered=[],schedule={tasks:[{id:'example'}]};let client;
 const source=readFileSync(new URL('agent-browser.js',import.meta.url),'utf8').replace(/^export /gm,'');
 const connect=runInNewContext(source+'\nconnectLocalAgent;',{document:{getElementById:get,createElement:()=>new Element()},location:{protocol:'http:',hostname:'127.0.0.1',port:'8788'},AbortController,setTimeout,clearTimeout});
 client=connect({getSchedule:()=>schedule,getLanguage:()=> 'en',clearResult:()=>client?.invalidate(),renderResult:r=>rendered.push(r),fetchImpl:async(url,options)=>url==='/api/health'?{json:async()=>({modelReady:true})}:new Promise(resolve=>pending.push({resolve,signal:options.signal}))});
 await client.readiness;
 const success={status:'complete',analysis:{status:'clear'},originalSchedule:schedule,externalActionsPerformed:false,modelDecisions:[{action:'analyze_evening'}],toolCalls:[{name:'analyze_evening'}]};
 return {client,get,pending,rendered,success};
}
test('AI controls render only a completed response and discard a late response after an input edit',async()=>{
 const f=await fixture();assert.equal(f.get('agent-run').disabled,false);
 const first=f.get('agent-run').fire('click');assert.equal(f.get('agent-run').disabled,true);f.client.invalidate();assert.equal(f.pending[0].signal.aborted,true);
 f.pending[0].resolve({ok:true,json:async()=>f.success});await first;assert.equal(f.rendered.length,0);assert.equal(f.get('agent-trace').children.length,0);
 const second=f.get('agent-run').fire('click');f.pending[1].resolve({ok:true,json:async()=>f.success});await second;
 assert.equal(f.rendered.length,1);assert.equal(f.get('agent-trace').children.length,2);assert.match(f.get('agent-status').textContent,/completed/);
});
test('cancel aborts inference; malformed traces are rejected before results are displayed',async()=>{
 const f=await fixture();const request=f.get('agent-run').fire('click');f.get('agent-cancel').fire('click');assert.equal(f.pending[0].signal.aborted,true);
 f.pending[0].resolve({ok:true,json:async()=>f.success});await request;assert.equal(f.rendered.length,0);
 const second=f.get('agent-run').fire('click');f.pending[1].resolve({ok:true,json:async()=>({...f.success,toolCalls:[{name:'delete_calendar'}]})});await second;
 assert.equal(f.rendered.length,0);assert.match(f.get('agent-status').textContent,/could not complete/);
});
