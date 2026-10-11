import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {existsSync} from 'node:fs';
import {readFile,writeFile,unlink} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createWebHandler} from './web-server.mjs';
import {localModelReady} from './local-model.mjs';
export async function startLocalApp(){
 const runtime=fileURLToPath(new URL('.local-ai/llama-b11552/llama-server.exe',import.meta.url));
 const model=fileURLToPath(new URL('.local-ai/Qwen3-1.7B-Q8_0.gguf',import.meta.url));
 if(!existsSync(runtime)||!existsSync(model))throw new Error('Run Setup-Local-AI.ps1 first.');
 for(const port of [8788,8790])await new Promise((resolve,reject)=>{
  const probe=createServer();probe.once('error',()=>reject(new Error(`Local port ${port} is already in use or unavailable. No existing service was stopped.`)));
  probe.listen(port,'127.0.0.1',()=>probe.close(resolve));
 });
 const child=spawn(runtime,['-m',model,'--host','127.0.0.1','--port','8790','--alias','calm-evening-local','-c','4096','-t','6','-tb','6','--jinja','--no-webui','--log-disable','--offline'],{windowsHide:true,stdio:'ignore'});
 let exited=false;child.once('exit',()=>{exited=true;});child.once('error',()=>{exited=true;});
 const server=createServer(createWebHandler());server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=135000;
 const stop=async()=>{child.kill();if(server.listening){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
 try{
  const deadline=Date.now()+45000;let ready=false;
  while(Date.now()<deadline&&!exited){if(await localModelReady()){ready=true;break;}await new Promise(resolve=>setTimeout(resolve,500));}
  if(!ready)throw new Error('Local model did not become ready.');
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(8788,'127.0.0.1',resolve);});
  return {origin:'http://127.0.0.1:8788',stop};
 }catch(error){await stop();throw error;}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const app=await startLocalApp();console.log(`Calm Evening is ready: ${app.origin}/`);
 const token=process.argv[process.argv.indexOf('--desktop-token')+1];
 const desktop=process.argv.includes('--desktop-token')&&/^[a-f0-9-]{36}$/.test(token);
 const stateFile=new URL('.local-ai/desktop-state.json',import.meta.url),stopFile=new URL('.local-ai/desktop-stop.json',import.meta.url);
 let polling,closing=false;
 const close=async()=>{if(closing)return;closing=true;clearInterval(polling);await app.stop();
  if(desktop){try{const state=JSON.parse(await readFile(stateFile,'utf8'));if(state.token===token)await unlink(stateFile);}catch{}try{await unlink(stopFile);}catch{}}
  process.exit(0);
 };
 if(desktop){
  await writeFile(stateFile,JSON.stringify({application:'calm-evening',token,pid:process.pid,origin:app.origin,readyAt:new Date().toISOString()}));
  polling=setInterval(async()=>{try{if(JSON.parse(await readFile(stopFile,'utf8')).token===token)await close();}catch{}},1000);
 }
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,close);
}
