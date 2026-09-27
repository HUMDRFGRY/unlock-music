/* UI, local Blob worker, file queue, preview player and dependency-free ZIP writer. */
(() => {
'use strict';
const $=id=>document.getElementById(id);
const paths={
 music:'<path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="2.5"/><ellipse cx="18" cy="16" rx="3" ry="2.5"/>',
 layers:'<path d="m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>',
 disc:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M6.7 9a6 6 0 0 1 3.8-2.8M14 17.8a6 6 0 0 0 3.8-3.8"/>',
 book:'<path d="M12 5v15M3 4h5a4 4 0 0 1 4 2 4 4 0 0 1 4-2h5v15h-5a5 5 0 0 0-4 2 5 5 0 0 0-4-2H3Z"/>',
 shield:'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="M9 12h6M12 9v6"/>',
 'shield-check':'<path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
 upload:'<path d="M12 15V3m-4 4 4-4 4 4M4 14v6h16v-6"/>',
 download:'<path d="M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>',
 sparkles:'<path d="m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7L12 3ZM20 2v4M18 4h4"/>',
 'hard-drive':'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M3 13h18M16 16h2M6 16h.1"/>',
 sliders:'<path d="M4 7h4m4 0h8M4 17h10m4 0h2"/><circle cx="10" cy="7" r="2"/><circle cx="16" cy="17" r="2"/>',
 archive:'<rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 15v2"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1.5-1.5 2.5M12 17h.01"/>',
 'music-lines':'<path d="M5 7v10M9 3v18M13 8v8M17 5v14M21 9v6"/>',
 play:'<path d="m8 4 12 8-12 8V4Z" fill="currentColor" stroke-width="0"/>',
 pause:'<path d="M8 5v14M16 5v14" stroke-width="4"/>',
 previous:'<path d="m18 5-10 7 10 7V5ZM5 5v14"/>',
 next:'<path d="m6 5 10 7-10 7V5ZM19 5v14"/>',
 volume:'<path d="m11 4-5 4H2v8h4l5 4V4ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
 muted:'<path d="m11 4-5 4H2v8h4l5 4V4ZM16 9l5 6M21 9l-5 6"/>',
 x:'<path d="m6 6 12 12M6 18 18 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 warning:'<path d="m12 3 10 18H2L12 3ZM12 9v5M12 17h.01"/>',
 clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 retry:'<path d="M3 9a9 9 0 1 1 .6 8M3 3v6h6"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>'
};
function icon(name){return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]||paths.music}</svg>`;}
function hydrateIcons(root=document){root.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=icon(el.dataset.icon);});}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const bytes=n=>n<1024?n+' B':n<1048576?(n/1024).toFixed(1)+' KiB':(n/1048576).toFixed(1)+' MiB';
const pad=n=>String(n).padStart(2,'0');
const time=n=>{n=Number.isFinite(n)?n:0;return Math.floor(n/60)+':'+String(Math.floor(n%60)).padStart(2,'0');};
let jobs=[],serial=0,running=false,paused=false,filter='all',activeJob=null,zipBusy=false,playingId=null,toastTimer,workerMode=null;
const exportUrls=new Set();
const audio=$('audio');audio.volume=.72;
const MAX_QUEUE=256*1024*1024,MAX_COUNT=100;
const DEMO=JSON.parse($('demo-data').textContent);
const engineText=$('engine-source').textContent;
function toast(s){$('toast').textContent=s;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),5000);}
function sanitizeName(s){
 let name=String(s).normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g,'_').replace(/[\u202a-\u202e\u2066-\u2069]/g,'').replace(/[. ]+$/g,'').trim();
 if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;
 return Array.from(name||'audio').slice(0,140).join('');
}
function outputNames(){
 const used=new Set(),out=new Map(),mode=$('naming').value;
 for(const j of jobs.filter(x=>x.status==='done')){
  const m=j.result.metadata;
  const raw=mode==='title'?m.title:mode==='artist-title'?(m.artist?m.artist+' - ':'')+m.title:j.file.name.replace(/\.[^.]+$/,'');
  const base=sanitizeName(raw);let n=base+'.'+j.result.format,count=2;
  while(used.has(n.toLowerCase()))n=base+' ('+(count++)+').'+j.result.format;
  used.add(n.toLowerCase());out.set(j.id,n);
 }
 return out;
}
function statusHtml(j){
 const defs={queued:['clock','等待处理','waiting'],working:['clock',j.progress+'%','working'],done:['check','已完成','done'],error:['warning','需检查','error'],cancelled:['x','已取消','cancelled']};
 const [i,label,cls]=defs[j.status];return `<span class="status ${cls}">${icon(i)}${label}</span>${j.status==='working'?`<div class="progress-line"><span style="width:${j.progress}%"></span></div>`:''}`;
}
function actionButton(action,title,ico,cls=''){return `<button class="icon-btn ${cls}" data-action="${action}" aria-label="${title}" title="${title}">${icon(ico)}</button>`;}
function render(){
 const done=jobs.filter(j=>j.status==='done').length,error=jobs.filter(j=>j.status==='error').length,queued=jobs.filter(j=>j.status==='queued').length;
 $('stat-total').textContent=pad(jobs.length);$('stat-done').textContent=pad(done);$('stat-error').textContent=pad(error);
 $('stat-error').style.color=error?'var(--danger)':'';
 $('queue-count').textContent=jobs.length;$('tab-all').textContent=jobs.length;$('tab-done').textContent=done;$('tab-error').textContent=error;
 $('session-size').textContent=jobs.length?bytes(jobs.reduce((n,j)=>n+j.file.size,0))+' 已添加 / 256 MiB 上限':'会话队列为空';
 $('zip-btn').disabled=!done||zipBusy;$('zip-btn').innerHTML=icon('download')+(zipBusy?'正在打包…':'下载全部');
 $('mobile-save').disabled=!done||zipBusy;
 $('clear-btn').disabled=!jobs.length;$('report-btn').disabled=!jobs.length;
 $('start-btn').hidden=!queued||running||(!paused&&$('auto-start').checked);
 $('pause-btn').hidden=!running||paused;
 $('queue-subtitle').textContent=running?(paused?'已暂停；当前文件完成后停止':'正在本机处理，页面保持响应'):queued?(paused?'队列已暂停，点击「开始处理」继续':'等待开始处理'):jobs.length?(done+' 个完成'+(error?' · '+error+' 个需要检查':'')):'添加文件后会自动开始处理';
 const rows=jobs.filter(j=>filter==='all'||j.status===filter);
 $('empty-state').hidden=rows.length>0;
 if(!rows.length){$('empty-state').querySelector('strong').textContent=jobs.length?'此分类下暂无文件':'还没有待处理的音乐';$('empty-state').querySelector('p').textContent=jobs.length?'可以切换至「全部」查看处理队列。':'选择本地文件，或点击「体验演示样本」试一试。';$('empty-demo').hidden=jobs.length>0;}
 $('queue-body').innerHTML=rows.map(j=>{
  const ext=j.file.name.split('.').pop().toUpperCase().slice(0,12),color=ext.startsWith('QMC')?'blue':ext==='KWM'?'sand':'';
  const details=bytes(j.file.size)+(j.result?' · '+j.result.kind:' · 本地文件');
  const notes=j.error?`<span class="file-note file-error">${esc(j.error)}</span>`:j.result?.warnings.length?`<span class="file-note">${esc(j.result.warnings[0])}</span>`:'';
  let actions='';if(j.status==='done')actions=actionButton('play','试听','play')+actionButton('download','下载文件','download');
  if(j.status==='error')actions+=actionButton('diagnose','查看诊断','help');
  if(['error','cancelled'].includes(j.status))actions+=actionButton('retry','重新处理','retry');
  if(j.status==='working')actions+=actionButton('cancel','取消当前文件','x');else actions+=actionButton('remove','从队列移除','x','remove');
  return `<tr data-id="${j.id}"><td><div class="file-cell"><div class="file-art ${color}">${icon('music')}</div><div class="file-text"><span class="file-name" title="${esc(j.file.name)}">${esc(j.file.name)}</span><span class="file-detail">${esc(details)}</span>${notes}</div></div></td><td>${j.result?`<span class="output-tag">${j.result.format.toUpperCase()}</span>`:'<span style="color:var(--faint)">—</span>'}</td><td>${statusHtml(j)}</td><td><div class="file-actions">${actions}</div></td></tr>`;
 }).join('');
 document.querySelectorAll('[data-filter]').forEach(b=>{const on=b.dataset.filter===filter;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
 refreshPlayerControls();
}
function showEngine(mode){workerMode=mode;$('engine-mode').textContent=mode==='worker'?'WORKER · 本地处理':'兼容模式 · 本地处理';}
async function runDecoder(j){
 let buffer=await j.file.arrayBuffer();if(j.cancelled)throw Error('CANCELLED');
 const progress=p=>{if(j.cancelled)throw Error('CANCELLED');j.progress=Math.min(100,Math.max(0,p));render();};
 if(typeof Worker==='function'){
  try{
   const result=await new Promise((resolve,reject)=>{
    let worker,workerUrl,timer,settled=false;
    const finish=(err,data)=>{if(settled)return;settled=true;clearTimeout(timer);worker?.terminate();if(workerUrl)URL.revokeObjectURL(workerUrl);j.abort=null;err?reject(err):resolve(data);};
    try{
     const handler=`\nself.onmessage=async(e)=>{try{const r=await OfflineMusicEngine.decode(e.data.buffer,e.data.name,p=>self.postMessage({kind:'progress',p}));const transfer=[r.bytes.buffer];if(r.cover)transfer.push(r.cover.bytes.buffer);self.postMessage({kind:'done',result:r},transfer);}catch(e){self.postMessage({kind:'error',message:e.message||String(e),code:e.code||null,diagnostics:e.diagnostics||null});}};`;
     workerUrl=URL.createObjectURL(new Blob([engineText,handler],{type:'text/javascript'}));worker=new Worker(workerUrl);
     worker.onmessage=e=>{if(j.cancelled){finish(Error('CANCELLED'));return;}if(e.data.kind==='progress')progress(e.data.p);else if(e.data.kind==='done'){showEngine('worker');finish(null,e.data.result);}else{const error=Error(e.data.message);error.code=e.data.code;error.diagnostics=e.data.diagnostics;finish(error);}};
     worker.onerror=e=>{e.preventDefault();const err=Error('WORKER_UNAVAILABLE');err.workerFailure=true;finish(err);};
     timer=setTimeout(()=>finish(Error('处理超时：请检查文件是否损坏，或尝试较小文件。')),120000);
     j.abort=()=>finish(Error('CANCELLED'));
     worker.postMessage({buffer,name:j.file.name},[buffer]);
    }catch(e){e.workerFailure=true;finish(e);}
   });
   return result;
  }catch(e){if(j.cancelled||!e.workerFailure)throw e;}
 }
 // file:// worker support can vary; no local server is required by this fallback.
 if(j.cancelled)throw Error('CANCELLED');showEngine('main');buffer=await j.file.arrayBuffer();
 return OfflineMusicEngine.decode(buffer,j.file.name,progress);
}
async function pump(){
 if(running||paused)return;
 const j=jobs.find(j=>j.status==='queued');if(!j)return;
 running=true;activeJob=j;j.status='working';j.progress=0;j.cancelled=false;j.error='';j.diagnostics=null;render();
 try{
  const result=await runDecoder(j);
  if(j.cancelled||!jobs.includes(j))return;
  j.result=result;j.blob=new Blob([result.bytes],{type:result.mime});j.url=URL.createObjectURL(j.blob);delete result.bytes;
  if(result.cover){j.coverUrl=URL.createObjectURL(new Blob([result.cover.bytes],{type:result.cover.mime}));delete result.cover.bytes;}
  j.status='done';j.progress=100;
 }catch(e){if(j.cancelled||e.message==='CANCELLED')j.status='cancelled';else{j.status='error';j.error=e.message||'处理失败';j.diagnostics=e.diagnostics||{schemaVersion:1,stage:'file-read-or-worker',code:e.code||'FILE_READ_OR_WORKER_FAILED',inputBytes:j.file.size};}}
 finally{running=false;activeJob=null;j.abort=null;render();if(!paused)queueMicrotask(pump);}
}
function addFiles(files){
 let added=0,skipped=0,reasons=[];
 let total=jobs.reduce((n,j)=>n+j.file.size,0);
 for(const f of files){
  if(!(f instanceof File))continue;
  let reason='';
  if(f.size===0)reason=f.name+' 是空文件';
  else if(f.size>OfflineMusicEngine.MAX_FILE)reason=f.name+' 超过单文件 128 MiB 上限';
  else if(total+f.size>MAX_QUEUE)reason='会话输入文件总量上限为 256 MiB，请先导出并清空';
  else if(jobs.length>=MAX_COUNT)reason='单次队列上限为 100 个文件';
  else if(jobs.some(j=>j.file.name===f.name&&j.file.size===f.size&&j.file.lastModified===f.lastModified))reason='相同文件已在队列中';
  if(reason){skipped++;reasons.push(reason);continue;}
  jobs.push({id:++serial,file:f,status:'queued',progress:0,result:null,error:'',cancelled:false});total+=f.size;added++;
 }
 filter='all';if($('auto-start').checked&&added){paused=false;pump();}render();
 if(added&&matchMedia('(max-width:800px)').matches)requestAnimationFrame(()=>document.querySelector('.queue-panel').scrollIntoView({block:'start'}));
 if(skipped)toast(`添加 ${added} 个，跳过 ${skipped} 个。${reasons[0]}`);
 else if(added)toast(`已添加 ${added} 个文件，${$('auto-start').checked?'正在本地处理。':'点击「开始处理」继续。'}`);
}
function loadDemo(){
 const files=DEMO.map(d=>new File([Uint8Array.from(atob(d.data),c=>c.charCodeAt(0))],d.name,{lastModified:0,type:'application/octet-stream'}));
 addFiles(files);
}
function cancelJob(j){j.cancelled=true;j.abort?.();j.status='cancelled';}
function release(j){
 if(j.status==='working')cancelJob(j);
 if(playingId===j.id)resetPlayer();
 if(j.url)URL.revokeObjectURL(j.url);if(j.coverUrl)URL.revokeObjectURL(j.coverUrl);j.result=null;j.blob=null;j.url=null;j.coverUrl=null;
}
async function saveBlob(blob,name){
 try {
  if(window.OfflineAndroid){
   toast('正在准备文件，请在系统窗口选择保存位置。');
   const result=await window.OfflineAndroid.save(blob,name);
   toast(result.cancelled?'已取消保存，处理结果仍在队列中。':'已保存：'+name);
  }else{
   const url=URL.createObjectURL(blob);exportUrls.add(url);
   const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
   setTimeout(()=>{URL.revokeObjectURL(url);exportUrls.delete(url);},60000);
  }
 }catch(e){toast('保存失败：'+(e.message||String(e)));}
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
async function crc32(blob){let c=0xffffffff;for(let off=0;off<blob.size;off+=1024*1024){const b=new Uint8Array(await blob.slice(off,off+1024*1024).arrayBuffer());for(const v of b)c=crcTable[(c^v)&255]^(c>>>8);await new Promise(r=>setTimeout(r,0));}return (c^0xffffffff)>>>0;}
async function makeZip(entries){
 // ZIP STORE; UTF-8 names, CRC32 and zero recompression of already-compressed audio.
 const parts=[],central=[],enc=new TextEncoder();let offset=0,centralSize=0;
 for(const e of entries){
  const name=enc.encode(e.name),crc=await crc32(e.blob),size=e.blob.size;
  if(size>0xffffffff||offset+size>0xffffffff)throw Error('ZIP 大小超过本 Demo 上限');
  const local=new Uint8Array(30),lv=new DataView(local.buffer);
  lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(12,33,true);lv.setUint32(14,crc,true);lv.setUint32(18,size,true);lv.setUint32(22,size,true);lv.setUint16(26,name.length,true);
  const cent=new Uint8Array(46),cv=new DataView(cent.buffer);
  cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(14,33,true);cv.setUint32(16,crc,true);cv.setUint32(20,size,true);cv.setUint32(24,size,true);cv.setUint16(28,name.length,true);cv.setUint32(42,offset,true);
  parts.push(local,name,e.blob);central.push(cent,name);offset+=30+name.length+size;centralSize+=46+name.length;
 }
 const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,offset,true);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
async function downloadAll(){
 if(zipBusy)return;const names=outputNames(),entries=jobs.filter(j=>j.status==='done').map(j=>({name:names.get(j.id),blob:j.blob}));if(!entries.length)return;
 zipBusy=true;render();try{const zip=await makeZip(entries);await saveBlob(zip,'unlock-music-export.zip');if(!window.OfflineAndroid)toast(`已交给浏览器保存 ZIP，包含 ${entries.length} 个音频文件。`);}catch(e){toast('打包失败：'+e.message);}finally{zipBusy=false;render();}
}
function report(){
 const names=outputNames();
 const data={app:'Unlock Music Offline Demo',version:'0.2.0',generatedAt:new Date().toISOString(),localOnly:true,sourceCommit:'dc518c5522bba43bd6248b58b56ecd1bb6058895',files:jobs.map(j=>({input:j.file.name,inputBytes:j.file.size,status:j.status,output:names.get(j.id)||null,outputBytes:j.blob?.size||0,metadata:j.result?.metadata||null,warnings:j.result?.warnings||[],error:j.error||null,diagnostics:j.diagnostics||j.result?.diagnostics||null}))};
 saveBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'unlock-music-report.json');
}
function showDiagnosis(j){
 const data={app:'Unlock Music Offline Demo',schemaVersion:1,localOnly:true,
  appVersion:'unknown',
  diagnostics:j.diagnostics||null};
 // Read the build stamp without collecting filenames, tags, audio/key bytes or paths.
 data.appVersion=document.querySelector('.about-link span')?.textContent.match(/(\d+\.\d+\.\d+)/)?.[1]||'unknown';
 $('dialog-title').textContent='文件诊断';const body=$('dialog-body');body.replaceChildren();
 const note=document.createElement('p');note.textContent='诊断不包含文件名、歌曲信息、音频内容或密钥。它记录格式、字节数和失败阶段，不会上传。原文件未改动。';
 const pre=document.createElement('pre');pre.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px';pre.textContent=JSON.stringify(data,null,2);
 const save=document.createElement('button');save.className='button primary';save.textContent='保存诊断 JSON';
 save.addEventListener('click',()=>saveBlob(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),'unlock-music-diagnostic.json'));
 body.append(note,pre,save);$('info-dialog').showModal();
}
function resetPlayer(){audio.pause();audio.removeAttribute('src');audio.load();playingId=null;$('player-title').textContent='等待一首音乐';$('player-artist').textContent='处理完成后，点击文件旁的播放按钮。';$('player-format').textContent='LOCAL';$('player-art').innerHTML=icon('music');$('seek').value=0;$('duration').textContent='0:00';$('current-time').textContent='0:00';refreshPlayerControls();}
function refreshPlayerControls(){const ready=jobs.filter(j=>j.status==='done'),has=playingId!==null;$('play-btn').disabled=!has;$('seek').disabled=!has;$('previous-btn').disabled=ready.length<2||!has;$('next-btn').disabled=ready.length<2||!has;$('play-btn').innerHTML=icon(audio.paused?'play':'pause');$('play-btn').setAttribute('aria-label',audio.paused?'播放':'暂停');}
async function playJob(j){
 if(!j||j.status!=='done')return;
 if(playingId!==j.id){audio.pause();playingId=j.id;audio.src=j.url;$('player-title').textContent=j.result.metadata.title;$('player-artist').textContent=j.result.metadata.artist||j.file.name;$('player-format').textContent=j.result.format.toUpperCase();$('player-art').innerHTML=icon('music');if(j.coverUrl){const img=new Image();img.alt='文件内嵌封面';img.src=j.coverUrl;img.onerror=()=>{if(playingId===j.id)$('player-art').innerHTML=icon('music');};$('player-art').replaceChildren(img);}}
 try{await audio.play();}catch(e){toast('浏览器暂时不能播放此音频，可下载后用本地播放器打开。');}refreshPlayerControls();
}
function skipTrack(direction){const ready=jobs.filter(j=>j.status==='done'),n=ready.findIndex(j=>j.id===playingId);if(n>=0&&ready.length>1)playJob(ready[(n+direction+ready.length)%ready.length]);}
const guide=`<h3>Android 离线安装版</h3><p>安装 APK 后无需联网。点击添加文件，在系统文件选择器中多选本地音乐；点击保存，选择目标文件夹。应用不申请网络或整盘存储权限。为兼容 Android 保存窗口，导出文件会临时写入应用私有缓存，保存、取消或下次启动时清理。关闭应用会丢失队列；退到后台暂停试听。请保持系统 WebView 为较新版本。</p><h3>双击打开，即可断网使用</h3><p>将 <code>index.html</code> 完整保存到电脑，再用 Edge 或 Chrome 打开。无需 Node.js、Python、服务器或首次联网缓存。</p><h3>试一下完整流程</h3><p>点击「体验演示样本」，会加入 3 个实际编码的 NCM、QMC3、KWM 测试文件。它们来自同一段原创合成旋律，不是预设的成功状态。处理完成后可试听、单曲下载，或下载全部 ZIP。</p><h3>处理自己的音乐</h3><p>拖入文件或点击「选择本地文件」。文件逐个处理；每个文件上限 128 MiB，输入队列总量上限 256 MiB，最多 100 个。解码和导出会占用额外内存，大文件建议小批量处理。</p><h3>导出与元数据</h3><p>保留音频原始编码，不做 MP3 / FLAC 转码。NCM 外层的歌名、歌手、专辑用于界面、命名和「导出记录」，不重新写入音频标签；音频本来包含的标签保留。文件内嵌的 NCM PNG / JPEG 封面可本地预览，不下载在线封面。</p><h3>队列、隐私与排错</h3><p>暂停队列会在当前文件完成后停止；单行 × 可取消当前任务。关闭或刷新页面会清空会话，请先下载。下载位置由浏览器设置决定。文件头检查不等于完整音频质量检查；无法试听时可用本地播放器验证。请只转换你拥有或已获授权的文件。</p>`;
const formats=`<p>这是从仓库提取解码逻辑制作的独立离线 Demo，不是完整 Vue 应用的构建包。扩展名相同，也可能采用不同版本的加密方案。</p><table><thead><tr><th>格式</th><th>此版本范围</th></tr></thead><tbody><tr><td>NCM</td><td>本地 AES / 音频解码；本地元数据；内嵌封面预览</td></tr><tr><td>旧版 QMC</td><td>qmc0 / qmc2 / qmc3 / qmcflac / qmcogg，静态掩码版本</td></tr><tr><td>MOO / TKM</td><td>bkcmp3 / bkcflac / tkm，沿用旧版 QMC 路径</td></tr><tr><td>KWM / XM</td><td>仓库所实现的旧版算法</td></tr><tr><td>TM0 / 2 / 3 / 6</td><td>仓库旧版头部修复；实际平台文件尚未验证</td></tr><tr><td>普通音频</td><td>MP3 / FLAC / WAV / OGG / M4A / AAC；检查后原样导出，不转码</td></tr><tr><td>MFLAC / MGG</td><td>本 Demo 未集成；不进行在线密钥查询</td></tr><tr><td>KGM / KGMA / VPR</td><td>本 Demo 未集成</td></tr><tr><td>CACHE / 新版 QMC</td><td>本 Demo 未集成</td></tr></tbody></table><p>本次测试主要采用独立生成的编码样本，未取得你的实际下载文件，不保证各平台所有历史或最新版本可用。无法识别有效音频时会报错，不会仅更改扩展名就宣称解码成功。</p>`;
function openDialog(type){
 const titles={guide:'开始使用',formats:'支持格式与边界',about:'一个真正本地的工作台'};
 $('dialog-title').textContent=titles[type]||titles.about;
 const about=`<p>基于 <code>HUMDRFGRY/unlock-music</code>，源码快照 <code>dc518c5522bb</code>。复用了 NCM、旧版 QMC、KWM、XM、TM 的格式处理思路，并重新制作了无依赖的离线界面。</p><h3>运行时没有外部请求</h3><p>所有脚本、样式、解码器和演示音频都在这一个 HTML 文件中；Android 版将同一个页面内置到 APK。页面不包含统计上报、CDN、在线封面和远程密钥查询。内容安全策略设置 <code>connect-src 'none'</code>。浏览器本身的后台联网行为不属于本页面控制范围。</p><h3>本地处理，而非上传</h3><p>优先使用本地 Blob Worker 解码；不可用时退回主线程兼容模式。仅使用内存保存队列，不记录文件列表到持久存储。网页版使用本地 Blob 下载；Android 使用分块传输与私有临时文件，保存到你通过系统窗口选定的位置。不要用本 Demo 处理无权转换的文件。</p><h3>许可与源码</h3><p>原解码代码版权 © 2019–2021 MengYX，遵循 MIT License。下载包包含完整许可证、可编辑源码、离线构建脚本及测试报告。</p><pre>${esc(document.documentElement.outerHTML.match(/<!-- LICENSE_START([\s\S]*?)LICENSE_END -->/)?.[1]||'MIT License · Copyright (c) 2019-2021 MengYX. See LICENSE in the download package.')}</pre>`;
 $('dialog-body').innerHTML=type==='guide'?guide:type==='formats'?formats:about;
 $('info-dialog').showModal();
}
hydrateIcons();
$('mobile-add').addEventListener('click',()=>$('file-input').click());
$('mobile-save').addEventListener('click',downloadAll);
$('settings-toggle').addEventListener('click',()=>{
 const open=$('settings-panel').classList.toggle('mobile-open');
 $('settings-toggle').setAttribute('aria-expanded',String(open));
 if(open)$('settings-panel').scrollIntoView({behavior:'smooth',block:'start'});
});
window.OfflineUI={
 back(){if($('info-dialog').open){$('info-dialog').close();return 'handled';}
 if($('settings-panel').classList.contains('mobile-open')){$('settings-panel').classList.remove('mobile-open');$('settings-toggle').setAttribute('aria-expanded','false');return 'handled';}
 return jobs.length?'confirm':'exit';},
 pause(){audio.pause();}
};
if(window.OfflineAndroid)document.querySelector('.offline-pill').innerHTML='<i></i> Android 离线版';

$('select-btn').addEventListener('click',()=>$('file-input').click());
$('file-input').addEventListener('change',e=>{addFiles(Array.from(e.target.files));e.target.value='';});
$('demo-btn').addEventListener('click',loadDemo);$('empty-demo').addEventListener('click',loadDemo);
$('nav-convert').addEventListener('click',()=>$('main').scrollIntoView({behavior:'smooth'}));
$('start-btn').addEventListener('click',()=>{paused=false;pump();render();});
$('pause-btn').addEventListener('click',()=>{paused=true;render();toast('队列已暂停，当前文件处理完成后停止。');});
$('auto-start').addEventListener('change',()=>{if($('auto-start').checked){paused=false;pump();}else paused=true;render();});
$('clear-btn').addEventListener('click',()=>{jobs.forEach(release);jobs=[];filter='all';render();toast('处理队列已清空，原文件不受影响。');});
$('zip-btn').addEventListener('click',downloadAll);$('report-btn').addEventListener('click',report);$('naming').addEventListener('change',()=>toast('命名方式已更新；会应用于后续下载。'));
$('queue-body').addEventListener('click',e=>{
 const button=e.target.closest('[data-action]');if(!button)return;const row=button.closest('[data-id]'),j=jobs.find(j=>j.id===Number(row.dataset.id));if(!j)return;
 if(button.dataset.action==='diagnose')showDiagnosis(j);
 if(button.dataset.action==='play')playJob(j);
 if(button.dataset.action==='download')saveBlob(j.blob,outputNames().get(j.id));
 if(button.dataset.action==='cancel'){cancelJob(j);render();}
 if(button.dataset.action==='remove'){release(j);jobs=jobs.filter(x=>x!==j);render();}
 if(button.dataset.action==='retry'){release(j);j.status='queued';j.error='';j.cancelled=false;paused=false;pump();render();}
});
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.filter;render();}));
document.querySelectorAll('[data-dialog]').forEach(b=>b.addEventListener('click',()=>openDialog(b.dataset.dialog)));
$('close-dialog').addEventListener('click',()=>$('info-dialog').close());$('dialog-ok').addEventListener('click',()=>$('info-dialog').close());
$('info-dialog').addEventListener('click',e=>{if(e.target===$('info-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}});
let depth=0;
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
window.addEventListener('drop',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();depth=0;$('dropzone').classList.remove('dragging');});
$('dropzone').addEventListener('dragenter',e=>{if(e.dataTransfer?.types.includes('Files')){e.preventDefault();depth++;$('dropzone').classList.add('dragging');}});
$('dropzone').addEventListener('dragleave',()=>{depth=Math.max(0,depth-1);if(!depth)$('dropzone').classList.remove('dragging');});
$('dropzone').addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
$('dropzone').addEventListener('drop',e=>{e.preventDefault();addFiles(Array.from(e.dataTransfer.files));depth=0;$('dropzone').classList.remove('dragging');});
$('play-btn').addEventListener('click',()=>{if(audio.paused){audio.play().catch(()=>toast('无法播放，请尝试下载后用本地播放器打开。'));}else audio.pause();});
$('previous-btn').addEventListener('click',()=>skipTrack(-1));$('next-btn').addEventListener('click',()=>skipTrack(1));
$('mute-btn').addEventListener('click',()=>{audio.muted=!audio.muted;$('mute-btn').innerHTML=icon(audio.muted?'muted':'volume');$('mute-btn').setAttribute('aria-label',audio.muted?'取消静音':'静音');});
$('seek').addEventListener('input',e=>{if(Number.isFinite(audio.duration))audio.currentTime=Number(e.target.value)/1000*audio.duration;});
for(const ev of ['play','pause','ended','emptied'])audio.addEventListener(ev,refreshPlayerControls);
audio.addEventListener('loadedmetadata',()=>{$('duration').textContent=time(audio.duration);});
audio.addEventListener('timeupdate',()=>{$('current-time').textContent=time(audio.currentTime);$('seek').value=Number.isFinite(audio.duration)&&audio.duration?Math.round(audio.currentTime/audio.duration*1000):0;});
audio.addEventListener('error',()=>{if(playingId!==null)toast('解码输出已保留；浏览器无法试听此文件，可下载后检查。');});
window.addEventListener('beforeunload',()=>{jobs.forEach(release);exportUrls.forEach(u=>URL.revokeObjectURL(u));});
// Exposed pure helper only, for offline ZIP/name regression tests; no file data globals.
window.OfflineMusicUtilities={sanitizeName,makeZip};
render();
})();
