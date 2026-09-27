/* Optional bridge. Ordinary browsers never expose OfflineNative and use Blob downloads. */
(() => {
 'use strict';
 const bridge=window.OfflineNative;
 if(!bridge||typeof bridge.beginExport!=='function')return;
 let pending=null;
 const MAX=300*1024*1024,CHUNK=48*1024;
 function check(result){if(typeof result!=='string'||result.startsWith('ERROR:'))throw Error(String(result||'原生保存接口不可用').replace(/^ERROR:/,''));return result;}
 window.onNativeSaveComplete=function(token,ok,cancelled,message){
  if(!pending||pending.token!==token)return;
  const task=pending;pending=null;
  if(ok||cancelled)task.resolve({cancelled:!!cancelled});else task.reject(Error(message||'写入文件失败'));
 };
 window.OfflineAndroid={async save(blob,name){
  if(pending)throw Error('请先完成当前的系统保存操作');
  if(!blob||blob.size<=0||blob.size>MAX)throw Error('导出文件大小必须在 1 字节至 300 MiB 之间');
  const token=check(bridge.beginExport(String(name),blob.type||'application/octet-stream',blob.size));
  let resolve,reject;const result=new Promise((a,b)=>{resolve=a;reject=b;});
  // Attach a rejection handler before native I/O can return asynchronously.
  result.catch(()=>{});pending={token,resolve,reject};
  try{
   for(let offset=0;offset<blob.size;offset+=CHUNK){
    const data=new Uint8Array(await blob.slice(offset,offset+CHUNK).arrayBuffer());
    let binary='';for(let i=0;i<data.length;i+=4096)binary+=String.fromCharCode(...data.subarray(i,i+4096));
    check(bridge.appendExport(token,btoa(binary)));
    await new Promise(r=>setTimeout(r,0));
   }
   check(bridge.finishExport(token));
  }catch(e){
   try{bridge.cancelExport(token);}catch{}
   if(pending?.token===token)pending=null;
   throw e;
  }
  return result;
 }};
})();
