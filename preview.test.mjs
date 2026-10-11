import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Minimal in-memory DOM for actual UI event handlers, not browser/rendering evidence.
class Node {
 constructor(tag='div'){this.tag=tag;this.children=[];this.handlers={};this._text='';}
 set textContent(value){this._text=String(value);this.children=[];}
 get textContent(){return this._text+this.children.map(child=>child.textContent).join('');}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this._text='';this.children=nodes;}
 addEventListener(event,handler){this.handlers[event]=handler;}
 fire(event){this.handlers[event]?.({preventDefault(){}});}
 querySelectorAll(tag){return this.children.flatMap(child=>[...(child.tag===tag?[child]:[]),...child.querySelectorAll(tag)]);}
}
function preview(){
 const html=readFileSync(new URL('preview.html',import.meta.url),'utf8'),root=new Node();
 for(const match of html.matchAll(/id="([^"]+)"/g)){const node=new Node();node.id=match[1];root.append(node);}
 const nodes=()=>{const all=[];const walk=node=>{all.push(node);node.children.forEach(walk);};walk(root);return all;};
 const get=id=>nodes().find(node=>node.id===id);
 const document={documentElement:{lang:'en'},getElementById:get,createElement:tag=>new Node(tag),createTextNode:text=>{const n=new Node('#text');n.textContent=text;return n;}};
 // Execute the actual classic script referenced by the double-clickable page.
 // Removing imports in a test hid the file-URL module loading failure.
 assert.ok(html.includes('<script defer src="browser-runtime.js"></script>'));
 assert.ok(!html.includes('type="module"'));
 const runtime=readFileSync(new URL('browser-runtime.js',import.meta.url),'utf8');
 assert.doesNotMatch(runtime,/^\s*(?:import|export)\s/m);
 runInNewContext(runtime,{document});
 return {get,document,set(id,value){const node=get(id);if(node.type==='checkbox')node.checked=value;else node.value=value;node.fire(node.type==='checkbox'?'change':'input');}};
}
test('preview handles fixed conflict, explicit flexibility and choosing a draft without moving the fixed session',()=>{
 const p=preview();p.get('schedule-form').fire('submit');
 assert.match(p.get('conflicts').textContent,/20 minutes short/);assert.equal(p.get('options').children.length,0);
 p.set('routine-locked',false);assert.equal(p.get('conflicts').children.length,0);
 p.get('schedule-form').fire('submit');assert.ok(p.get('options').children.length>0);
 assert.match(p.get('options').children[0].textContent,/18:50–19:20/);
 p.get('options').children[0].querySelectorAll('button')[0].fire('click');
 assert.equal(p.get('lesson-start').value,'17:30');assert.equal(p.get('lesson-end').value,'18:30');
 assert.equal(p.get('routine-start').value,'18:50');assert.equal(p.get('routine-end').value,'19:20');
 assert.match(p.get('result-note').textContent,/calendar is unchanged/);assert.equal(p.get('options').children.length,0);
 p.get('language').fire('click');assert.equal(p.document.documentElement.lang,'pl');
 assert.equal(p.get('routine-start').value,'18:50');assert.match(p.get('headline').textContent,/Wieczór/);
});
test('editing invalidates drafts and invalid movable windows produce an actionable error, never stale options',()=>{
 const p=preview();p.set('routine-locked',false);p.get('schedule-form').fire('submit');assert.ok(p.get('options').children.length>0);
 p.set('routine-windowEnd','18:45');assert.equal(p.get('options').children.length,0);
 p.get('schedule-form').fire('submit');assert.match(p.get('result-title').textContent,/check your times/);
 assert.equal(p.get('options').children.length,0);assert.equal(p.get('conflicts').children.length,0);
 p.set('routine-windowEnd','19:30');p.set('routine-locked',true);p.get('schedule-form').fire('submit');
 assert.match(p.get('result-summary').textContent,/No move inside/);assert.equal(p.get('options').children.length,0);
});
