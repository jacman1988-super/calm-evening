import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validate,InputError} from './constraints.mjs';
import {runEveningAgent} from './agent.mjs';
import {createLocalModelAdapter,localModelReady} from './local-model.mjs';
import {createMcpHandler} from './server.mjs';
const files={'/':['preview.html','text/html'],'/preview.css':['preview.css','text/css'],'/browser-runtime.js':['browser-runtime.js','text/javascript'],'/preview.js':['preview.js','text/javascript'],'/agent-browser.js':['agent-browser.js','text/javascript'],'/constraints.mjs':['constraints.mjs','text/javascript']};
export function createWebHandler({fetchImpl=fetch,now=Date.now}={}){
 const mcp=createMcpHandler();let active=0,count=0,windowStart=now();
 return async(req,res)=>{
  const send=(status,value,type='application/json')=>{res.writeHead(status,{'Content-Type':type+'; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});res.end(type==='application/json'?JSON.stringify(value):value);};
  if(typeof req.headers.host!=='string'||!/^(127\.0\.0\.1|localhost):8788$/.test(req.headers.host)||
   (req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`))return send(403,{error:'origin_rejected'});
  if(req.url==='/mcp')return mcp(req,res);
  if(req.method==='GET'&&files[req.url]){const [file,type]=files[req.url];try{return send(200,await readFile(new URL(file,import.meta.url),'utf8'),type);}catch{return send(500,{error:'file_unavailable'});}}
  if(req.method==='GET'&&req.url==='/api/health')return send(200,{modelReady:await localModelReady({fetchImpl}),provider:'local llama.cpp',storage:false});
  if(req.url!=='/api/agent')return send(404,{error:'not_found'});
  if(req.method!=='POST')return send(405,{error:'post_required'});
  if(req.headers['content-type']?.split(';')[0].trim()!=='application/json')return send(415,{error:'json_required'});
  if(now()-windowStart>=60000){windowStart=now();count=0;}
  if(++count>12)return send(429,{error:'wait_before_retry'});
  if(active)return send(429,{error:'model_busy'});
  const controller=new AbortController();const cancel=()=>{if(!res.writableEnded)controller.abort();};
  req.on('aborted',cancel);res.on('close',cancel);active++;
  try{
   const chunks=[];let bytes=0;
   for await(const chunk of req){bytes+=chunk.length;if(bytes>8192)return send(413,{error:'request_too_large'});chunks.push(chunk);}
   let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return send(400,{error:'invalid_json'});}
   if(!input||Array.isArray(input)||Object.keys(input).some(key=>!['schedule','goal'].includes(key))||!['check','options'].includes(input.goal))return send(400,{error:'invalid_input'});
   validate(input.schedule);
   const modelDecisions=[];
   const result=await runEveningAgent({schedule:input.schedule,goal:input.goal,signal:controller.signal,timeoutMs:30000,decide:createLocalModelAdapter({fetchImpl,onDecision:decision=>modelDecisions.push(decision)})});
   if(controller.signal.aborted)return;
   return send(200,{...result,modelDecisions,source:'local model choices and verified constraint calculations',modelProvider:'llama.cpp local; no Alexa connection'});
  }catch(error){if(!controller.signal.aborted)return send(error instanceof InputError?400:500,{error:error instanceof InputError?'invalid_schedule':'could_not_process'});}
  finally{active--;req.off('aborted',cancel);res.off('close',cancel);}
 };
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const server=createServer(createWebHandler());server.requestTimeout=10000;server.headersTimeout=10000;server.timeout=135000;
 server.listen(8788,'127.0.0.1',()=>console.log('Calm Evening: http://127.0.0.1:8788/ (local model expected on port 8790)'));
}
