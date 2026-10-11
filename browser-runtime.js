(() => {
class InputError extends Error {}
const fail = message => { throw new InputError(message); };
const fields = ['id', 'start', 'end', 'transitionMinutes', 'locked', 'windowStart', 'windowEnd'];
function object(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) fail('Only documented schedule fields are accepted.');
}
function minutes(time) {
  if (typeof time !== 'string' || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) fail('Use same-day times in HH:MM format.');
  const [hours, mins] = time.split(':').map(Number); return hours * 60 + mins;
}
const time = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
function validate(input) {
  object(input, ['tasks']);
  if (!Array.isArray(input.tasks) || input.tasks.length < 2 || input.tasks.length > 8) fail('Provide between two and eight tasks.');
  const ids = new Set();
  return input.tasks.map(task => {
    object(task, fields);
    if (typeof task.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(task.id) || ids.has(task.id)) fail('Use unique short task IDs, without names or personal identifiers.');
    ids.add(task.id);
    const start = minutes(task.start), end = minutes(task.end), transition = task.transitionMinutes;
    if (end <= start || !Number.isInteger(transition) || transition < 0 || transition > 180 || end + transition > 1439 || typeof task.locked !== 'boolean') fail('Check task duration, transition time and locked flag. Overnight tasks are not supported.');
    if (task.locked && (task.windowStart !== undefined || task.windowEnd !== undefined)) fail('Locked tasks must not include a movable window.');
    let windowStart, windowEnd;
    if (!task.locked) {
      windowStart = minutes(task.windowStart); windowEnd = minutes(task.windowEnd);
      if (windowEnd <= windowStart || start < windowStart || end > windowEnd) fail('A movable window must contain the whole current task.');
    }
    return {...task, start, end, transition, windowStart, windowEnd};
  });
}
function conflicts(tasks) {
  const sorted = [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)), found = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const first = sorted[i], second = sorted[j];
      if (second.start >= first.end + first.transition) continue;
      found.push({from: first.id, to: second.id,
        kind: second.start < first.end ? 'overlap' : 'transition_shortfall',
        shortfallMinutes: first.end + first.transition - second.start,
        bothLocked: first.locked && second.locked});
    }
  }
  return found;
}
function serialize(tasks) {
  return [...tasks].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id)).map(task => ({
    id: task.id, start: time(task.start), end: time(task.end),
    transitionMinutes: task.transition, locked: task.locked,
    ...(!task.locked ? {windowStart: time(task.windowStart), windowEnd: time(task.windowEnd)} : {})
  }));
}
function analyzeEvening(input) {
  const tasks = validate(input), found = conflicts(tasks);
  return {status: found.length ? 'conflict' : 'clear', conflicts: found,
    schedule: serialize(tasks), source: 'deterministic constraint calculation',
    limitations: ['Same-day times only; no real travel or calendar availability lookup.']};
}
function proposeEveningOptions(input) {
  const tasks = validate(input), initial = conflicts(tasks);
  if (!initial.length) return {status: 'already_clear', options: [], conflicts: [], externalActionsPerformed: false};
  const options = [];
  for (const [index, task] of tasks.entries()) {
    if (task.locked) continue;
    const duration = task.end - task.start;
    for (let start = task.windowStart; start <= task.windowEnd - duration; start++) {
      if (start === task.start || start + duration + task.transition > 1439) continue;
      const candidate = tasks.map((value, i) => i === index ? {...value, start, end: start + duration} : value);
      if (conflicts(candidate).length) continue;
      options.push({changedTask: task.id, shiftMinutes: start - task.start,
        schedule: serialize(candidate), requiresUserChoice: true});
    }
  }
  options.sort((a, b) => Math.abs(a.shiftMinutes) - Math.abs(b.shiftMinutes) || a.shiftMinutes - b.shiftMinutes || a.changedTask.localeCompare(b.changedTask));
  // Distinct alternatives rather than three almost identical one-minute shifts.
  const selected = [];
  for (const option of options) {
    if (selected.some(other => other.changedTask === option.changedTask && Math.abs(other.shiftMinutes - option.shiftMinutes) < 15)) continue;
    selected.push(option); if (selected.length === 3) break;
  }
  return {status: selected.length ? 'options_ready' : 'needs_coordination', options: selected,
    conflicts: initial, externalActionsPerformed: false,
    explanation: selected.length ? 'These are drafts. Locked tasks and durations are preserved. No calendar has been changed.'
      : 'No single-task move inside the stated windows resolves all conflicts. Ask about an alternative appointment or help; neither is assumed available.',
    limitations: ['Search changes one movable task at a time, within its explicitly supplied window.', 'No messages, bookings or calendar updates are performed.']};
}

function connectLocalAgent({getSchedule,renderResult,clearResult,getLanguage,fetchImpl=globalThis.fetch?.bind(globalThis)}){
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


const copy = {
 en: {eyebrow:'A little room to breathe', headline:'An evening with space\nfor what matters.',lead:'See whether your plans fit — including the time between them. Fixed appointments stay fixed.',fictional:'Illustrative, fictional schedule. Edit it to explore your own timing; nothing is saved or sent.',scheduleTitle:'Your evening',localPill:'Local calculations',names:{lesson:'Scheduled session',routine:'Evening routine'},start:'Starts',end:'Ends',transition:'Minutes needed afterwards',locked:'Fixed time',windowStart:'Earliest allowed start',windowEnd:'Latest allowed finish',check:'Check my evening',windowHint:'Uncheck “Fixed time” only if you can move that activity. Its allowed window must contain its current start and finish.',resultLabel:'A calmer perspective',initialTitle:'Let’s find some breathing room.',initialSummary:'Check your schedule to see any overlap or missing transition time.',staleTitle:'Your schedule has changed.',staleSummary:'Check again to see options for the new times.',clearTitle:'There is room between your plans.',clearSummary:'Your activities and the minutes needed afterwards fit within this same-day schedule.',conflictTitle:'A little more time is needed.',coordination:'No move inside the allowed windows resolves this clash. You could discuss another appointment or support; availability has not been checked.',optionsSummary:'These alternatives change one flexible activity. Fixed times and activity lengths are preserved.',conflict:(a,b,m)=>`${a} → ${b}: ${m} minutes short.`,option:(n,name,shift)=>`Option ${n} · ${name} ${shift > 0 ? 'later' : 'earlier'} by ${Math.abs(shift)} min`,apply:'Use in this preview',note:'Drafts only. No calendar, messages or bookings are changed.',applied:'Selected for this preview only. Your calendar is unchanged.',errorTitle:'Please check your times.',error:'Use valid same-day start and finish times, a transition of 0–180 minutes, and an allowed window containing each flexible activity.',footer:'Powered by the same deterministic constraint engine as the Calm Evening MCP prototype. This preview does not run an AI model or connect to Alexa.',limits:'Two activities in this preview. Same-day times only; no travel, calendar availability or overnight scheduling. No data storage or network requests.'},
 pl: {eyebrow:'Trochę miejsca na oddech',headline:'Wieczór z przestrzenią\nna to, co ważne.',lead:'Sprawdź, czy plany mieszczą się w czasie — razem z chwilą pomiędzy nimi. Stałe godziny pozostają stałe.',fictional:'Przykładowy, fikcyjny harmonogram. Zmień godziny, aby sprawdzić własny wariant; nic nie zapisujemy ani nie wysyłamy.',scheduleTitle:'Twój wieczór',localPill:'Lokalne obliczenia',names:{lesson:'Umówione zajęcia',routine:'Wieczorny rytuał'},start:'Początek',end:'Koniec',transition:'Minuty potrzebne po zakończeniu',locked:'Stała godzina',windowStart:'Najwcześniejszy początek',windowEnd:'Najpóźniejszy koniec',check:'Sprawdź mój wieczór',windowHint:'Odznacz „Stała godzina” tylko wtedy, gdy możesz przesunąć tę czynność. Dozwolony przedział musi obejmować jej obecny początek i koniec.',resultLabel:'Spokojniejsze spojrzenie',initialTitle:'Znajdźmy trochę oddechu.',initialSummary:'Sprawdź harmonogram, aby zobaczyć nakładanie godzin lub brak czasu na przejście.',staleTitle:'Harmonogram się zmienił.',staleSummary:'Sprawdź ponownie, aby zobaczyć propozycje dla nowych godzin.',clearTitle:'Między planami jest przestrzeń.',clearSummary:'Czynności i czas potrzebny po nich mieszczą się w tym jednodniowym harmonogramie.',conflictTitle:'Potrzeba jeszcze trochę czasu.',coordination:'Żadne przesunięcie w dozwolonych przedziałach nie rozwiązuje tej kolizji. Można omówić inny termin lub pomoc; ich dostępność nie została sprawdzona.',optionsSummary:'Te warianty zmieniają jedną elastyczną czynność. Zachowują stałe godziny i długość zajęć.',conflict:(a,b,m)=>`${a} → ${b}: brakuje ${m} minut.`,option:(n,name,shift)=>`Wariant ${n} · ${name} ${shift > 0 ? 'później' : 'wcześniej'} o ${Math.abs(shift)} min`,apply:'Wybierz w podglądzie',note:'Tylko propozycje. Nie zmieniamy kalendarza, wiadomości ani rezerwacji.',applied:'Wybrano tylko w tym podglądzie. Kalendarz pozostaje bez zmian.',errorTitle:'Sprawdź wpisane godziny.',error:'Podaj poprawny początek i koniec w jednym dniu, czas przejścia 0–180 minut oraz przedział obejmujący każdą elastyczną czynność.',footer:'Ten sam silnik obliczający ograniczenia co w prototypie Calm Evening MCP. Podgląd nie uruchamia modelu AI i nie łączy się z Alexą.',limits:'Dwie czynności w tym podglądzie. Godziny w jednym dniu; bez sprawdzania podróży, dostępności kalendarza i planowania przez północ. Bez zapisu danych i zapytań do sieci.'}
};
let language = 'en';
let agentUI;
copy.en.fictional='Illustrative, fictional schedule. Edit it to explore your own timing; your inputs stay on this computer and are not saved.';
copy.pl.fictional='Przykładowy, fikcyjny harmonogram. Zmień godziny, aby sprawdzić własny wariant; dane pozostają na tym komputerze i nie są zapisywane.';
Object.assign(copy.en,{notExplored:'A conflict was found; alternative times have not been explored yet.',footer:'Ordinary checks use local calculations. Optional AI runs on this computer and chooses read-only tools. Alexa is not connected.',limits:'Same-day times only; no travel or calendar availability lookup. No data storage. AI mode sends structured times only to this computer’s local application.'});
Object.assign(copy.pl,{notExplored:'Znaleziono kolizję; alternatywne godziny nie zostały jeszcze sprawdzone.',footer:'Zwykłe sprawdzanie korzysta z lokalnych obliczeń. Opcjonalne AI działa na tym komputerze i wybiera narzędzia do odczytu. Alexa nie jest podłączona.',limits:'Godziny w jednym dniu; bez sprawdzania podróży i dostępności kalendarza. Bez zapisu danych. Tryb AI przekazuje godziny tylko do aplikacji lokalnej na tym komputerze.'});
const $ = id => document.getElementById(id);
const tasks = [
 {id:'lesson',start:'17:30',end:'18:30',transitionMinutes:20,locked:true,windowStart:'17:00',windowEnd:'19:00'},
 {id:'routine',start:'18:30',end:'19:00',transitionMinutes:0,locked:true,windowStart:'18:30',windowEnd:'19:30'}
];
const element = (tag, text, className) => {const node=document.createElement(tag); if(text!==undefined)node.textContent=text; if(className)node.className=className; return node;};
function clearResults(changed = true) {
 agentUI?.invalidate();
 const c=copy[language]; $('result-title').textContent=changed?c.staleTitle:c.initialTitle;
 $('result-summary').textContent=changed?c.staleSummary:c.initialSummary;
 $('conflicts').replaceChildren(); $('options').replaceChildren(); $('result-note').textContent=c.note;
}
function renderForm() {
 const c=copy[language]; $('tasks').replaceChildren();
 for(const task of tasks){
  const section=element('div',undefined,'task'), head=element('div',undefined,'task-head');
  head.append(element('h3',c.names[task.id])); const lockLabel=element('label',undefined,'lock');
  const lock=element('input');lock.type='checkbox';lock.checked=task.locked;lock.id=`${task.id}-locked`;
  lockLabel.append(lock,document.createTextNode(c.locked));head.append(lockLabel);section.append(head);
  const fields=element('div',undefined,'fields'),window=element('div',undefined,'fields window');window.hidden=task.locked;
  for(const [key,type,label] of [['start','time',c.start],['end','time',c.end],['transitionMinutes','number',c.transition],['windowStart','time',c.windowStart],['windowEnd','time',c.windowEnd]]){
   const field=element('label',label),input=element('input');input.type=type;input.value=task[key];input.id=`${task.id}-${key}`;input.required=true;
   if(type==='number'){input.min='0';input.max='180';input.step='1';}
   if(key.startsWith('window'))input.disabled=task.locked;
   input.addEventListener('input',()=>{task[key]=type==='number'?Number(input.value):input.value;clearResults();});
   field.append(input);(key.startsWith('window')?window:fields).append(field);
  }
  lock.addEventListener('change',()=>{task.locked=lock.checked;window.hidden=task.locked;window.querySelectorAll('input').forEach(input=>input.disabled=task.locked);clearResults();});
  section.append(fields,window);$('tasks').append(section);
 }
}
function inputSchedule(){return {tasks:tasks.map(({id,start,end,transitionMinutes,locked,windowStart,windowEnd})=>({id,start,end,transitionMinutes,locked,...(!locked?{windowStart,windowEnd}:{})}))};}
function evaluate(applied=false){
 const c=copy[language]; clearResults(false);
 try{
  const analysis=analyzeEvening(inputSchedule()),proposals=proposeEveningOptions(inputSchedule());
  renderCalculations(analysis,proposals,applied);
 }catch(error){
  if(!(error instanceof InputError))throw error;
  $('result-title').textContent=c.errorTitle;$('result-summary').textContent=c.error;
 }
}
function renderCalculations(analysis,proposals,applied=false){
 const c=copy[language];$('conflicts').replaceChildren();$('options').replaceChildren();
  $('result-title').textContent=analysis.status==='clear'?c.clearTitle:c.conflictTitle;
  $('result-summary').textContent=analysis.status==='clear'?c.clearSummary:!proposals?c.notExplored:proposals.options.length?c.optionsSummary:c.coordination;
  for(const issue of analysis.conflicts)$('conflicts').append(element('div',c.conflict(c.names[issue.from],c.names[issue.to],issue.shortfallMinutes),'conflict'));
  for(const [index,option] of (proposals?.options??[]).entries()){
   const card=element('div',undefined,'option');card.append(element('h3',c.option(index+1,c.names[option.changedTask],option.shiftMinutes)));
   for(const task of option.schedule){const row=element('div',undefined,'row');row.append(element('span',c.names[task.id]),element('strong',`${task.start}–${task.end}`));card.append(row);}
   const button=element('button',c.apply);button.type='button';button.addEventListener('click',()=>{
    for(const proposed of option.schedule){const task=tasks.find(value=>value.id===proposed.id);task.start=proposed.start;task.end=proposed.end;}
    renderForm();evaluate(true);
   });card.append(button);$('options').append(card);
  }
  $('result-note').textContent=applied?c.applied:c.note;
}
function translate(){
 const c=copy[language];document.documentElement.lang=language;$('language').textContent=language==='en'?'Polski':'English';
 for(const [id,key] of [['eyebrow','eyebrow'],['headline','headline'],['lead','lead'],['fictional','fictional'],['schedule-title','scheduleTitle'],['local-pill','localPill'],['check','check'],['window-hint','windowHint'],['result-label','resultLabel'],['footer','footer'],['limits','limits']])$(id).textContent=c[key];
 renderForm();clearResults(false);agentUI?.translate();
}
$('language').addEventListener('click',()=>{language=language==='en'?'pl':'en';translate();});
$('schedule-form').addEventListener('submit',event=>{event.preventDefault();evaluate();});
translate();
agentUI=connectLocalAgent({getSchedule:inputSchedule,getLanguage:()=>language,clearResult:()=>clearResults(false),renderResult:result=>{
 const expected=analyzeEvening(result.originalSchedule);
 if(JSON.stringify(result.analysis)!==JSON.stringify(expected)||(result.proposals&&JSON.stringify(result.proposals)!==JSON.stringify(proposeEveningOptions(result.originalSchedule))))throw new Error('Invalid calculation result.');
 renderCalculations(result.analysis,result.proposals);
}});

})();
