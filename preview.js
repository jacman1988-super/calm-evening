import {analyzeEvening, proposeEveningOptions, InputError} from './constraints.mjs';
import {connectLocalAgent} from './agent-browser.js';

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
