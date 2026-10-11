import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const run=args=>new Promise((resolve,reject)=>{
 const child=spawn(process.execPath,[fileURLToPath(new URL('desktop-launch.mjs',import.meta.url)),...args],{windowsHide:true,stdio:'inherit'});
 child.once('error',reject);child.once('exit',code=>code===0?resolve():reject(new Error(`Launcher exit ${code}`)));
});
await run([]);
try{
 const response=await fetch('http://127.0.0.1:8788/api/health',{signal:AbortSignal.timeout(5000)});
 assert.equal(response.status,200);assert.equal((await response.json()).modelReady,true);
 const page=await fetch('http://127.0.0.1:8788/');assert.equal(page.status,200);assert.match(await page.text(),/agent-run/);
 console.log('PASS: detached desktop startup, real model health, and HTTP page. Browser appearance not verified.');
}finally{
 await run(['--stop']);
 const deadline=Date.now()+10000;let stopped=false;
 while(Date.now()<deadline){try{await readFile(new URL('.local-ai/desktop-state.json',import.meta.url));}catch(error){if(error.code==='ENOENT'){stopped=true;break;}}await new Promise(resolve=>setTimeout(resolve,250));}
 assert.equal(stopped,true);console.log('PASS: graceful stop of the owned app and model.');
}
