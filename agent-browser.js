export function connectLocalAgent({getSchedule,renderResult,clearResult,getLanguage,fetchImpl=globalThis.fetch?.bind(globalThis)}){
 const $=id=>document.getElementById(id);
 const text={
  en:{title:'Ask your local AI assistant',privacy:'The model runs on this computer. Your schedule is not sent to an outside AI service.',goal:'What would you like to do?',options:'Find possible adjustments',check:'Check whether it fits',run:'Ask local AI',cancel:'Cancel',offline:'To enable AI, open the application folder in Windows File Explorer and double-click Uruchom-Calm-Evening.cmd. It opens the locally running app. This file preview offers ordinary calculations.',unavailable:'The local model is not ready. Ordinary calculations remain available.',ready:'Local AI is ready. You choose when it runs.',busy:'AI is choosing tools and checking your schedule…',success:'Local AI completed its check. Suggestions are drafts.',error:'AI could not complete the check safely. No schedule was changed. You can retry or use ordinary calculations.',trace:'Tools chosen by local AI',analyze_evening:'Check timing and transition',propose_evening_options:'Explore allowed adjustments'},
  pl:{title:'Zapytaj lokalnego asystenta AI',privacy:'Model działa na tym komputerze. Harmonogram nie trafia do zewnętrznej usługi AI.',goal:'Co chcesz zrobić?',options:'Znajdź możliwe przesunięcia',check:'Sprawdź, czy godziny pasują',run:'Zapytaj lokalne AI',cancel:'Anuluj',offline:'Aby włączyć AI, otwórz folder aplikacji w Eksploratorze Windows i kliknij dwukrotnie Uruchom-Calm-Evening.cmd. Otworzy się pełna aplikacja. Ten podgląd pozwala wykonać zwykłe obliczenia.',unavailable:'Lokalny model nie jest gotowy. Zwykłe obliczenia nadal działają.',ready:'Lokalne AI jest gotowe. Ty wybierasz, kiedy je uruchomić.',busy:'AI wybiera narzędzia i sprawdza harmonogram…',success:'Lokalne AI zakończyło sprawdzanie. Propozycje pozostają do Twojego wyboru.',error:'AI nie mogło bezpiecznie zakończyć sprawdzania. Nie zmieniono harmonogramu. Spróbuj ponownie lub użyj zwykłych obliczeń.',trace:'Narzędzia wybrane przez lokalne AI',analyze_evening:'Sprawdzenie godzin i przerwy',propose_evening_options:'Wyszukanie dozwolonych przesunięć'}
 };
 const served=typeof location!=='undefined'&&location.protocol==='http:'&&['127.0.0.1','localhost'].includes(location.hostname)&&location.port==='8788';
 let ready=false,busy=false,epoch=0,controller,status=served?'unavailable':'offline';
 const c=()=>text[getLanguage()];
 function translate(){const t=c();for(const [id,key] of [['agent-title','title'],['agent-privacy','privacy'],['agent-goal-label','goal'],['agent-options','options'],['agent-check','check'],['agent-run','run'],['agent-cancel','cancel']])$(id).textContent=t[key];$('agent-status').textContent=t[status];$('agent-run').disabled=!ready||busy;$('agent-cancel').hidden=!busy;}
 function invalidate(){epoch++;controller?.abort();controller=undefined;busy=false;status=served?(ready?'ready':'unavailable'):'offline';$('agent-trace').replaceChildren();translate();}
 async function run(){
  if(!ready||busy)return;
  clearResult();const generation=++epoch,schedule=getSchedule(),goal=$('agent-goal').value;
  controller=new AbortController();const requestController=controller,signal=requestController.signal;busy=true;status='busy';translate();
  const timer=setTimeout(()=>requestController.abort(),125000);
  try{
   const response=await fetchImpl('/api/agent',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({schedule,goal}),signal});
   if(!response.ok)throw new Error();const result=await response.json();
   if(generation!==epoch||signal.aborted)return;
   if(result.status!=='complete'||!result.analysis||result.externalActionsPerformed!==false||JSON.stringify(result.originalSchedule)!==JSON.stringify(schedule)||!Array.isArray(result.modelDecisions)||!result.modelDecisions.length)throw new Error();
   if(!Array.isArray(result.toolCalls)||!result.toolCalls.length||result.toolCalls.some(call=>!['analyze_evening','propose_evening_options'].includes(call.name)))throw new Error();
   renderResult(result);
   const heading=document.createElement('h3');heading.textContent=c().trace;const list=document.createElement('ol');
   for(const call of result.toolCalls){if(!['analyze_evening','propose_evening_options'].includes(call.name))throw new Error();const item=document.createElement('li');item.textContent=c()[call.name];list.append(item);}
   $('agent-trace').replaceChildren(heading,list);status='success';
  }catch{if(generation===epoch&&!signal.aborted)status='error';else if(generation===epoch)status='ready';}
  finally{clearTimeout(timer);if(generation===epoch){busy=false;controller=undefined;translate();}}
 }
 $('agent-run').addEventListener('click',run);$('agent-cancel').addEventListener('click',()=>{clearResult();invalidate();});$('agent-goal').addEventListener('change',()=>{clearResult();invalidate();});
 translate();
 const readiness=served&&fetchImpl?fetchImpl('/api/health').then(response=>response.json()).then(value=>{ready=value.modelReady===true;status=ready?'ready':'unavailable';translate();}).catch(()=>{}):Promise.resolve();
 return {invalidate,translate,readiness};
}
