import {writeFile,readFile,mkdir} from 'node:fs/promises';
import {setTimeout as pause} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdirSync,writeFileSync} from 'node:fs';
export const folder=path.dirname(fileURLToPath(import.meta.url));
export const baseUrl=(process.env.OFFICE_TEST_URL||'http://127.0.0.1:4186').replace(/\/$/,'');
export async function connect() {
  const targets=await(await fetch(`${process.env.OFFICE_CDP_URL||'http://127.0.0.1:9286'}/json`)).json();
  const ws=new WebSocket(targets.find(target=>target.type==='page').webSocketDebuggerUrl);
  await new Promise(resolve=>ws.addEventListener('open',resolve,{once:true}));
  let id=0;const waiting=new Map();const errors=[];const requests=[];
  const audit={baseUrl,requests,workerTargets:[],responses:[],blocked:[],errors:[]};
  const auditing=process.env.OFFICE_NETWORK_AUDIT==='1';
  const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const next=++id;waiting.set(next,{resolve,reject});ws.send(JSON.stringify({id:next,method,params,...(sessionId?{sessionId}:{})}));});
  async function enableAudit(sessionId){
    await send('Network.enable',{},sessionId);
    await send('Network.setCacheDisabled',{cacheDisabled:true},sessionId);
    await send('Network.setBlockedURLs',{urlPatterns:[{urlPattern:`${new URL(baseUrl).origin}/*`,block:false},{urlPattern:'http://*:*/*',block:true},{urlPattern:'https://*:*/*',block:true}]},sessionId);
    await send('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},sessionId);
    if(!sessionId)await send('Fetch.enable',{patterns:[{urlPattern:'http://*'},{urlPattern:'https://*'}]});
  }
  ws.addEventListener('message',({data})=>{
    const msg=JSON.parse(data);
    if(msg.id){const item=waiting.get(msg.id);waiting.delete(msg.id);msg.error?item.reject(msg.error):item.resolve(msg.result);return;}
    if(msg.method==='Runtime.exceptionThrown')errors.push(msg.params.exceptionDetails);
    if(msg.method==='Network.requestWillBeSent')requests.push({url:msg.params.request.url,method:msg.params.request.method,target:msg.sessionId||'page'});
    if(msg.method==='Network.responseReceived')audit.responses.push({url:msg.params.response.url,status:msg.params.response.status,mime:msg.params.response.mimeType,target:msg.sessionId||'page'});
    if(auditing&&msg.method==='Fetch.requestPaused'){
      const request=msg.params.request;
      const allowed=new URL(request.url).origin===new URL(baseUrl).origin&&['GET','HEAD'].includes(request.method);
      if(!allowed)audit.blocked.push({url:request.url,method:request.method});
      send(allowed?'Fetch.continueRequest':'Fetch.failRequest',{requestId:msg.params.requestId,...(allowed?{}:{errorReason:'BlockedByClient'})},msg.sessionId).catch(error=>audit.errors.push(error));
    }
    if(auditing&&msg.method==='Target.attachedToTarget'){
      const session=msg.params.sessionId;audit.workerTargets.push({type:msg.params.targetInfo.type,url:msg.params.targetInfo.url});
      (async()=>{try{await send('Runtime.enable',{},session);await enableAudit(session);}catch(error){audit.errors.push(error);}finally{await send('Runtime.runIfWaitingForDebugger',{},session);}})().catch(error=>audit.errors.push(error));
    }
  });
  function persistAudit(){if(auditing&&process.env.OFFICE_AUDIT_FILE){mkdirSync(path.dirname(process.env.OFFICE_AUDIT_FILE),{recursive:true});writeFileSync(process.env.OFFICE_AUDIT_FILE,JSON.stringify(audit,null,2));}}
  if(auditing)process.once('exit',persistAudit);
  const evaluate=async expression=>{const response=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(response.exceptionDetails)throw Error(JSON.stringify(response.exceptionDetails));return response.result.value;};
  const until=async(expression,seconds=30)=>{for(let i=0;i<seconds*10;i++){if(await evaluate(expression))return;await pause(100);}throw Error(`Timeout: ${expression}; ${await evaluate('document.body.innerText.slice(-1300)')}`);};
  const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  const navigate=async tool=>{await send('Page.navigate',{url:`${baseUrl}/#${tool==='home'?'home':`tool/${tool}`}`});await until(`document.readyState==='complete'&&typeof state!=='undefined'&&${tool==='home'?'!state.tool':`state.tool?.id===${JSON.stringify(tool)}`}&&document.querySelector('main').children.length>0`);};
  const upload=async files=>{const {root}=await send('DOM.getDocument');const {nodeId}=await send('DOM.querySelector',{nodeId:root.nodeId,selector:'#file-input'});await send('DOM.setFileInputFiles',{nodeId,files});await until('state.phase==="select"');};
  const shot=async name=>{const result=await send('Page.captureScreenshot',{format:'png'});await writeFile(path.join(folder,name),Buffer.from(result.data,'base64'));};
  const input=async(selector,value)=>{await evaluate(`{const input=document.querySelector(${JSON.stringify(selector)});input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}`);};
  const saveBlob=async(selector,destination)=>{const encoded=await evaluate(`(async()=>{const data=new Uint8Array(await(await fetch(document.querySelector(${JSON.stringify(selector)}).href)).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=8192)binary+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(binary)})()`);await mkdir(path.dirname(destination),{recursive:true});await writeFile(destination,Buffer.from(encoded,'base64'));};
  await send('Page.enable');await send('Runtime.discardConsoleEntries');await send('Runtime.enable');await send('Network.enable');
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
  await send('Network.setCacheDisabled',{cacheDisabled:true});
  if(auditing)await enableAudit();
  if(process.env.OFFICE_COLD_START==='1')await send('Storage.clearDataForOrigin',{origin:new URL(baseUrl).origin,storageTypes:'all'});
  await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:`${baseUrl}/?review=${Date.now()}#home`});
  await until('document.readyState==="complete"&&typeof state!=="undefined"&&!!document.querySelector(".tool-card")');
  return {send,evaluate,until,click,navigate,upload,shot,input,saveBlob,errors,requests,audit,close:()=>{persistAudit();ws.close();}};
}
export const check=(value,message)=>{if(!value)throw Error(message);};
