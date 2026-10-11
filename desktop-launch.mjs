import {spawn} from 'node:child_process';
import {readFile,writeFile,open} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const stateFile=new URL('.local-ai/desktop-state.json',import.meta.url);
const readState=async()=>{try{return JSON.parse(await readFile(stateFile,'utf8'));}catch{return null;}};
const alive=state=>{try{if(state?.application!=='calm-evening'||!Number.isSafeInteger(state.pid)||!/^[a-f0-9-]{36}$/.test(state.token))return false;process.kill(state.pid,0);return true;}catch{return false;}};
try{
 const existing=await readState();
 if(process.argv.includes('--stop')){
  if(alive(existing))await writeFile(new URL('.local-ai/desktop-stop.json',import.meta.url),JSON.stringify({token:existing.token}));
  console.log('Wyslano prosbe o zatrzymanie lokalnego AI.');
 }else if(alive(existing)){
  console.log('Planer jest juz uruchomiony.');
 }else{
  const token=randomUUID(),log=await open(new URL('.local-ai/desktop.log',import.meta.url),'a');
  const child=spawn(process.execPath,[fileURLToPath(new URL('start-local.mjs',import.meta.url)),'--desktop-token',token],{cwd:fileURLToPath(new URL('.',import.meta.url)),windowsHide:true,detached:true,stdio:['ignore',log.fd,log.fd]});
  let ended=false;child.once('error',()=>{ended=true;});child.once('exit',()=>{ended=true;});child.unref();await log.close();
  const deadline=Date.now()+60000;let ready=false;
  while(!ended&&Date.now()<deadline){const state=await readState();if(state?.token===token&&alive(state)){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error('Nie udalo sie uruchomic lokalnego AI. Szczegoly sa w .local-ai/desktop.log.');
  console.log('Planer jest gotowy. Model pracuje na tym komputerze.');
 }
}catch(error){console.error(error.code==='ENOENT'?'Brakuje plikow lokalnego modelu. Najpierw uruchom Setup-Local-AI.ps1.':error.message);process.exitCode=1;}
