/* Unlock Music Offline Demo 0.1.0
 * Decoding logic adapted from HUMDRFGRY/unlock-music @ dc518c5522bba43bd6248b58b56ecd1bb6058895.
 * Original copyright (c) 2019-2021 MengYX, MIT. See LICENSE.
 * Offline adaptation: bounded parsers, dependency-free AES, local-only metadata,
 * cooperative progress, strict unsupported-format errors. No network APIs.
 */
(function (root) {
  'use strict';
  const MAX_FILE = 128 * 1024 * 1024;
  const MIME = {mp3:'audio/mpeg',flac:'audio/flac',ogg:'audio/ogg',wav:'audio/wav',m4a:'audio/mp4',aac:'audio/aac'};
  const QMC_EXT = new Set(['qmc0','qmc2','qmc3','qmcflac','qmcogg','bkcmp3','bkcflac','tkm','666c6163','6d7033','6f6767','6d3461','776176']);
  const RAW_EXT = new Set(['mp3','flac','ogg','wav','m4a','aac']);
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', {fatal:true});
  const text = (b) => new TextDecoder().decode(b);
  const starts = (b, s, o=0) => b.length >= o+s.length && Array.from(s).every((c,i)=>b[o+i] === (typeof c === 'string' ? c.charCodeAt(0) : c));
  const fail = (msg) => {throw new Error(msg);};
  function checkRange(b, off, len, label='文件') {
    if (!Number.isSafeInteger(off) || !Number.isSafeInteger(len) || off<0 || len<0 || off>b.length || len>b.length-off) fail(label+'数据截断或长度字段无效');
  }
  const wait = () => new Promise(r=>setTimeout(r,0));
  async function transform(b, fn, progress) {
    const chunk=512*1024;
    for (let i=0;i<b.length;i+=chunk) {
      const end=Math.min(b.length,i+chunk);
      for(let j=i;j<end;j++) b[j]=fn(b[j],j);
      progress?.(15+Math.floor(end/Math.max(1,b.length)*75));
      await wait();
    }
    return b;
  }
  // AES-128 inverse cipher (FIPS-197). Only used for small NCM key / metadata blocks.
  // This is a format adapter, not a general-purpose cryptography library.
  function mul(a,b) { let p=0; for(let i=0;i<8;i++){if(b&1)p^=a;a=((a<<1)^((a&128)?0x11b:0))&255;b>>>=1;}return p; }
  const S=new Uint8Array(256), I=new Uint8Array(256);
  for(let x=0;x<256;x++) {
    let p=1,a=x,k=254;
    while(k){if(k&1)p=mul(p,a);a=mul(a,a);k>>>=1;}
    if(!x)p=0;
    const rot=(v,n)=>((v<<n)|(v>>(8-n)))&255;
    const s=p^rot(p,1)^rot(p,2)^rot(p,3)^rot(p,4)^0x63;S[x]=s;I[s]=x;
  }
  function expandKey(key) {
    if(key.length!==16)fail('AES 密钥长度无效');
    const w=new Uint8Array(176);w.set(key);let rcon=1;
    for(let n=16;n<176;n+=4){let t=Array.from(w.slice(n-4,n));if(n%16===0){t=[S[t[1]]^rcon,S[t[2]],S[t[3]],S[t[0]]];rcon=mul(rcon,2);}for(let j=0;j<4;j++)w[n+j]=w[n-16+j]^t[j];}
    return w;
  }
  function aesEcbDecrypt(cipher,key,unpad=true) {
    if(!cipher.length || cipher.length%16)fail('NCM 的 AES 数据块长度无效');
    const w=expandKey(key),out=new Uint8Array(cipher.length);
    for(let off=0;off<cipher.length;off+=16){
      let s=new Uint8Array(cipher.subarray(off,off+16));
      for(let j=0;j<16;j++)s[j]^=w[160+j];
      for(let round=9;round>=0;round--){
        const t=s.slice();
        for(let col=0;col<4;col++)for(let row=0;row<4;row++)s[4*col+row]=I[t[4*((col-row+4)%4)+row]];
        for(let j=0;j<16;j++)s[j]^=w[16*round+j];
        if(round)for(let col=0;col<4;col++){
          const n=4*col,[a,b,c,d]=s.slice(n,n+4);
          s[n]=mul(a,14)^mul(b,11)^mul(c,13)^mul(d,9);
          s[n+1]=mul(a,9)^mul(b,14)^mul(c,11)^mul(d,13);
          s[n+2]=mul(a,13)^mul(b,9)^mul(c,14)^mul(d,11);
          s[n+3]=mul(a,11)^mul(b,13)^mul(c,9)^mul(d,14);
        }
      }
      out.set(s,off);
    }
    if(!unpad)return out;
    const n=out[out.length-1];if(n<1||n>16||out.slice(-n).some(x=>x!==n))fail('NCM 密钥或元数据无法解密（填充校验失败）');
    return out.slice(0,-n);
  }
  function base64(s){
    if(!s.length || s.length%4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(s))fail('NCM 元数据编码无效');
    const b=atob(s);return Uint8Array.from(b,c=>c.charCodeAt(0));
  }
  const CORE=encoder.encode('hzHRAmso5kInbaxW');
  const META=Uint8Array.from([0x23,0x31,0x34,0x6c,0x6a,0x6b,0x5f,0x21,0x5c,0x5d,0x26,0x30,0x55,0x3c,0x27,0x28]);
  function keyStream(key){
    if(!key.length)fail('NCM 音频密钥为空');
    const box=Uint8Array.from({length:256},(_,i)=>i);let j=0;
    for(let i=0;i<256;i++){j=(box[i]+j+key[i%key.length])&255;[box[i],box[j]]=[box[j],box[i]];}
    return box.map((_,n,a)=>{const i=(n+1)&255;return a[(a[i]+a[(i+a[i])&255])&255];});
  }
  const cleanText=x=>typeof x==='string'?x.replace(/[\x00-\x1f\x7f]/g,' ').slice(0,1000).trim():'';
  async function ncm(b,progress){
    if(!starts(b,'CTENFDAM'))fail('不是有效的 NCM 文件');
    const view=new DataView(b.buffer,b.byteOffset,b.byteLength);let off=10;
    const read=()=>{checkRange(b,off,4,'NCM');const n=view.getUint32(off,true);off+=4;return n;};
    const take=(len,max,label)=>{if(len>max)fail(label+'超过安全上限');checkRange(b,off,len,label);const v=b.slice(off,off+len);off+=len;return v;};
    const keyData=aesEcbDecrypt(take(read(),65536,'NCM 密钥').map(x=>x^0x64),CORE);
    if(!starts(keyData,'neteasecloudmusic'))fail('NCM 密钥标识无效');
    const stream=keyStream(keyData.slice(17));
    const metaLen=read(),rawMeta=take(metaLen,1024*1024,'NCM 元数据');let metadata={},warnings=[];
    if(metaLen){
      try{
        const raw=rawMeta.map(x=>x^0x63);
        if(!starts(raw,"163 key(Don't modify):"))fail('NCM 元数据标识无效');
        const plain=decoder.decode(aesEcbDecrypt(base64(decoder.decode(raw.slice(22))),META));
        const colon=plain.indexOf(':');if(colon<0)fail('NCM 元数据格式无效');
        let m=JSON.parse(plain.slice(colon+1));if(plain.slice(0,colon)==='dj')m=m.mainMusic;
        if(!m || typeof m!=='object')fail('NCM 元数据结构无效');
        metadata={title:cleanText(m.musicName),artist:Array.isArray(m.artist)?m.artist.filter(Array.isArray).map(a=>cleanText(a[0])).filter(Boolean).join(' / '):'',album:cleanText(m.album)};
      }catch(e){warnings.push('元数据读取失败，已保留音频：'+e.message);}
    }
    checkRange(b,off,13,'NCM 封面头');
    const coverCapacity=view.getUint32(off+5,true),coverSize=view.getUint32(off+9,true);
    if(coverCapacity>16*1024*1024 || coverSize>coverCapacity)fail('NCM 封面长度字段无效');
    checkRange(b,off+13,coverCapacity,'NCM 封面');
    let cover=null;
    const img=b.slice(off+13,off+13+coverSize);
    if(starts(img,[0xff,0xd8,0xff]))cover={bytes:img,mime:'image/jpeg'};
    else if(starts(img,[137,80,78,71,13,10,26,10]))cover={bytes:img,mime:'image/png'};
    off+=13+coverCapacity;
    const bytes=await transform(b.slice(off),(v,i)=>v^stream[i&255],progress);
    return {bytes,metadata,cover,warnings,kind:'NCM 解码'};
  }
  const default44=[0xde,0x51,0xfa,0xc3,0x4a,0xd6,0xca,0x90,0x7e,0x67,0x5e,0xf7,0xd5,0x52,0x84,0xd8,0x47,0x95,0xbb,0xa1,0xaa,0xc6,0x66,0x23,0x92,0x62,0xf3,0x74,0xa1,0x9f,0xf4,0xa0,0x1d,0x3f,0x5b,0xf0,0x13,0x0e,0x09,0x3d,0xf9,0xbc,0x00,0x11];
  const mapping=new Map();for(let i=0;i<128;i++){const x=(i*i+27)%256;if(!mapping.has(x))mapping.set(x,[]);mapping.get(x).push(i);}
  const mask128=new Uint8Array(128);Array.from(mapping.keys()).sort((a,b)=>a-b).forEach((x,n)=>mapping.get(x).forEach(i=>mask128[i]=default44[n]));
  async function qmc(b,progress){
    let index=-1,maskIndex=-1;
    const bytes=await transform(b.slice(),v=>{index++;maskIndex++;if(index===0x8000||(index>0x8000&&(index+1)%0x8000===0)){index++;maskIndex++;}if(maskIndex>=128)maskIndex-=128;return v^mask128[maskIndex];},progress);
    return {bytes,kind:'旧版 QMC 解码'};
  }
  async function kwm(b,progress){
    if(!starts(b,'yeelion-kuwo-tme')){if(sniff(b)==='aac')return {bytes:b,kind:'AAC 原样导出'};fail('不是此 Demo 支持的 KWM 文件');}
    checkRange(b,0,0x400,'KWM 头部');
    const key=new DataView(b.buffer,b.byteOffset,b.byteLength).getBigUint64(0x18,true).toString();
    const str=key.padEnd(32,key).slice(0,32),preset='MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk';
    const mask=Uint8Array.from(str,(c,i)=>c.charCodeAt(0)^preset.charCodeAt(i));
    return {bytes:await transform(b.slice(0x400),(v,i)=>v^mask[i%32],progress),kind:'KWM 解码'};
  }
  async function xm(b,progress){
    checkRange(b,0,16,'XM 头部');
    if(!starts(b,'ifmt')||!starts(b,[254,254,254,254],8))fail('不是有效的 XM 文件');
    if(![' WAV','FLAC',' MP3',' A4M'].includes(text(b.slice(4,8))))fail('XM 内部音频类型不受支持');
    const offset=b[12]|(b[13]<<8)|(b[14]<<16),key=b[15];
    if(offset>b.length-16)fail('XM 数据偏移超出文件长度');
    return {bytes:await transform(b.slice(16),(v,i)=>i<offset?v:((v-key)^255)&255,progress),kind:'XM 解码'};
  }
  function mp3FrameLength(b,o){
    if(o+4>b.length||b[o]!==255||(b[o+1]&224)!==224)return 0;
    const v=(b[o+1]>>3)&3,layer=(b[o+1]>>1)&3,bi=b[o+2]>>4,sr=(b[o+2]>>2)&3,pad=(b[o+2]>>1)&1;
    if(v===1||!layer||!bi||bi===15||sr===3)return 0;
    const rates=[44100,48000,32000],hz=rates[sr]/(v===3?1:v===2?2:4);
    const tables=v===3 ? {3:[0,32,64,96,128,160,192,224,256,288,320,352,384,416,448],2:[0,32,48,56,64,80,96,112,128,160,192,224,256,320,384],1:[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320]} : {3:[0,32,48,56,64,80,96,112,128,144,160,176,192,224,256],2:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160],1:[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160]};
    const br=tables[layer][bi]*1000;
    return layer===3?(Math.floor(12*br/hz)+pad)*4:Math.floor((layer===1&&v!==3?72:144)*br/hz)+pad;
  }
  const synchsafe=b=>{if(b.length!==4||b.some(x=>x&128))fail('ID3 长度字段无效');return (b[0]<<21)|(b[1]<<14)|(b[2]<<7)|b[3];};
  // Skip only well-formed, bounded ID3v2 tags, never arbitrary bytes or guessed offsets.
  // Tags may precede AAC/FLAC as well as MP3. Keep the original bytes on export.
  function probeAudio(b){
    let offset=0,tagCount=0;
    const result=(format='',frameOffset=offset,issue='')=>({format,tagBytes:offset,tagCount,frameOffset,issue});
    while(starts(b,'ID3',offset)){
      if(++tagCount>16)return result('',offset,'TOO_MANY_ID3_TAGS');
      if(offset+10>b.length)return result('',offset,'TRUNCATED_ID3_TAG');
      const version=b[offset+3],flags=b[offset+5];
      if(![2,3,4].includes(version)||b[offset+4]===255||
          (flags & (version===2?0x3f:version===3?0x1f:0x0f)))return result('',offset,'INVALID_ID3_TAG');
      let size;try{size=synchsafe(b.subarray(offset+6,offset+10));}catch{return result('',offset,'INVALID_ID3_TAG');}
      const footer=version===4&&(flags&0x10)?10:0,end=offset+10+size+footer;
      if(end>b.length)return result('',offset,'TRUNCATED_ID3_TAG');
      if(footer&&(!starts(b,'3DI',end-10)||b.subarray(end-7,end).some((v,i)=>v!==b[offset+3+i])))
        return result('',offset,'INVALID_ID3_FOOTER');
      offset=end;
    }
    const p=b.subarray(offset);
    if(starts(p,'fLaC')&&p.length>=42)return result('flac');
    if(starts(p,'RIFF')&&starts(p,'WAVE',8)&&p.length>=44)return result('wav');
    if(starts(p,'OggS')&&p.length>=28)return result('ogg');
    if(starts(p,'ftyp',4)&&p.length>=16)return result('m4a');
    // ADTS, like MPEG audio, needs a chain of bounded frames, not one lucky sync word.
    let cursor=offset,adtsFrames=0,config=-1;
    while(adtsFrames<3&&cursor+7<=b.length){
      if(b[cursor]!==255||(b[cursor+1]&0xf6)!==0xf0||((b[cursor+2]>>2)&15)>=13)break;
      const frameSize=((b[cursor+3]&3)<<11)|(b[cursor+4]<<3)|(b[cursor+5]>>5);
      const headerSize=(b[cursor+1]&1)?7:9;
      const currentConfig=((b[cursor+1]&8)<<16)|(b[cursor+2]<<8)|(b[cursor+3]&0xc0);
      if(frameSize<=headerSize||cursor+frameSize>b.length||(config!==-1&&currentConfig!==config))break;
      config=currentConfig;cursor+=frameSize;adtsFrames++;
      if(cursor===b.length||adtsFrames===3)return result('aac');
    }
    // One incidental MPEG sync word inside ciphertext is not evidence of audio.
    for(let o=offset;o<Math.min(b.length-3,offset+4096);o++){
      const n1=mp3FrameLength(b,o);if(!n1||o+n1>b.length)continue;
      const p2=o+n1;if(o===offset&&p2===b.length)return result('mp3',o);
      const n2=mp3FrameLength(b,p2);if(!n2||p2+n2>b.length)continue;
      const p3=p2+n2;if(o===offset&&p3===b.length)return result('mp3',o);
      const n3=mp3FrameLength(b,p3);if(n3&&p3+n3<=b.length)return result('mp3',o);
    }
    return result();
  }
  function sniff(b){return probeAudio(b).format;}
  function validateAudio(b,ext){
    const probe=probeAudio(b);
    if(probe.tagBytes&&probe.format===ext)b=b.subarray(probe.tagBytes);
    if(!b.length)fail('音频数据为空');
    const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
    if(ext==='flac'){
      if((b[4]&127)!==0||((b[5]<<16)|(b[6]<<8)|b[7])!==34)fail('FLAC STREAMINFO 无效');
      let off=4,last=false,count=0;while(!last){if(++count>10000)fail('FLAC 元数据块数量异常');checkRange(b,off,4,'FLAC');last=!!(b[off]&128);const n=(b[off+1]<<16)|(b[off+2]<<8)|b[off+3];checkRange(b,off+4,n,'FLAC');off+=4+n;}if(off>=b.length)fail('FLAC 缺少音频帧');
    }else if(ext==='wav'){
      if(view.getUint32(4,true)+8>b.length)fail('WAV 文件被截断');
      let off=12,fmt=false,data=false;
      while(off+8<=b.length){const n=view.getUint32(off+4,true);checkRange(b,off+8,n,'WAV');if(starts(b,'fmt ',off))fmt=n>=16;if(starts(b,'data',off))data=n>0;off+=8+n+(n%2);}
      if(!fmt||!data)fail('WAV 缺少格式块或音频块');
    }else if(ext==='ogg'){
      const n=b[26];checkRange(b,27,n,'OGG 段表');let size=0;for(let i=0;i<n;i++)size+=b[27+i];checkRange(b,27+n,size,'OGG 音频页');if(b[4]!==0)fail('不支持的 OGG 版本');
    }else if(ext==='m4a'){
      const n=view.getUint32(0);if(n<16||n>b.length)fail('M4A 容器头部无效');
    }else if(ext==='aac'){
      const n=((b[3]&3)<<11)|(b[4]<<3)|(b[5]>>5);if(n<7||n>b.length)fail('AAC 音频帧不完整');
    }
  }
  function id3Text(b){
    if(!b.length)return '';const enc=b[0],raw=b.slice(1);let s='';
    try{s=new TextDecoder(enc===0?'windows-1252':enc===1?'utf-16':enc===2?'utf-16be':'utf-8').decode(raw);}catch{}
    return cleanText(s.replace(/\0/g,' / ').replace(/(?: \/ )+$/,''));
  }
  function localMetadata(b,ext){
    const m={};
    try{
      if(ext==='mp3'&&starts(b,'ID3')&&[3,4].includes(b[3])&&!(b[5]&0xc0)){
        const end=Math.min(b.length,10+synchsafe(b.slice(6,10)));let off=10;
        while(off+10<=end){const id=text(b.slice(off,off+4));if(!/^[A-Z0-9]{4}$/.test(id))break;const n=b[3]===4?synchsafe(b.slice(off+4,off+8)):new DataView(b.buffer,b.byteOffset+off+4,4).getUint32(0);if(!n||off+10+n>end)break;
          const field={TIT2:'title',TPE1:'artist',TALB:'album'}[id];if(field&&n<65536)m[field]=id3Text(b.slice(off+10,off+10+n));off+=10+n;
        }
      }else if(ext==='flac'){
        const probe=probeAudio(b);if(probe.tagBytes)b=b.subarray(probe.tagBytes);
        let off=4,last=false;while(!last&&off+4<=b.length){last=!!(b[off]&128);const type=b[off]&127,n=(b[off+1]<<16)|(b[off+2]<<8)|b[off+3];checkRange(b,off+4,n);
          if(type===4&&n<1024*1024){const block=b.slice(off+4,off+4+n),v=new DataView(block.buffer);let p=0;const read=()=>{checkRange(block,p,4);const x=v.getUint32(p,true);p+=4;return x;};const len=read();checkRange(block,p,len);p+=len;const count=read();if(count>10000)break;for(let i=0;i<count;i++){const k=read();checkRange(block,p,k);const s=text(block.slice(p,p+k));p+=k;const eq=s.indexOf('='),field={TITLE:'title',ARTIST:'artist',ALBUM:'album'}[s.slice(0,eq).toUpperCase()];if(field)m[field]=cleanText(s.slice(eq+1));}}
          off+=4+n;
        }
      }
    }catch{/* Bad optional tags never prevent export of an otherwise recognized stream. */}
    return m;
  }
  function extensionOf(name){
    const nameText=String(name),dot=nameText.lastIndexOf('.');
    return dot<0?'':nameText.slice(dot+1).toLowerCase();
  }
  function signature(b){
    if(!b||!b.length)return 'EMPTY';
    if(starts(b,'CTENFDAM'))return 'NCM';
    if(starts(b,'yeelion-kuwo-tme'))return 'KWM';
    if(starts(b,'ifmt'))return 'XM';
    if(starts(b,'ID3'))return 'ID3v2';
    if(starts(b,'fLaC'))return 'FLAC';
    if(starts(b,'RIFF')&&starts(b,'WAVE',8))return 'RIFF/WAVE';
    if(starts(b,'OggS'))return 'Ogg';
    if(starts(b,'ftyp',4))return 'ISO-BMFF';
    if(starts(b,'MAC '))return 'APE (not integrated)';
    if(starts(b,'DSD '))return 'DSF (not integrated)';
    if(starts(b,[0x30,0x26,0xb2,0x75,0x8e,0x66,0xcf,0x11]))return 'ASF/WMA (not integrated)';
    if(starts(b,[0x50,0x4b,0x03,0x04]))return 'ZIP (not audio)';
    if(/^\s*(?:<!doctype html|<html[\s>])/i.test(text(b.subarray(0,80))))return 'HTML (not audio)';
    if(b.length>=7&&b[0]===255&&(b[1]&0xf6)===0xf0)return 'ADTS candidate';
    if(mp3FrameLength(b,0))return 'MPEG audio candidate';
    return 'UNKNOWN';
  }
  function diagnosticError(message,code){const e=new Error(message);e.code=code;return e;}
  async function decode(input,name,progress=()=>{}){
    const ext=extensionOf(name);
    const diagnostic={schemaVersion:1,inputExtension:/^[a-z0-9]{1,16}$/.test(ext)?'.'+ext:'(unknown)',
      inputBytes:0,inputSignature:'UNKNOWN',decoder:'none',stage:'input',outputBytes:null,outputSignature:null};
    try{
      const b=input instanceof Uint8Array?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);
      diagnostic.inputBytes=b.length;diagnostic.inputSignature=signature(b);
      if(!b.length)throw diagnosticError('文件为空','EMPTY_FILE');
      if(b.length>MAX_FILE)throw diagnosticError('单文件上限为 128 MiB','FILE_TOO_LARGE');
      progress(5);
      const oldEncrypted=QMC_EXT.has(ext)||['ncm','kwm','xm','tm0','tm2','tm3','tm6'].includes(ext);
      let plain='';
      // Avoid decrypting an already-decoded file just because its old suffix remains.
      // Only accept validated audio exactly after optional tags, not a sync in ciphertext.
      if(oldEncrypted&&!['NCM','KWM','XM'].includes(diagnostic.inputSignature)){
        const probe=probeAudio(b);
        if(probe.format&&probe.frameOffset===probe.tagBytes){try{validateAudio(b,probe.format);plain=probe.format;}catch{/* Not proven plaintext. */}}
      }
      let r;
      diagnostic.stage='decode';
      if(plain){
        diagnostic.decoder='plaintext';
        r={bytes:b,kind:'已是普通音频 · 原样导出',warnings:['文件内容已是 '+plain.toUpperCase()+'，不再按 .'+ext+' 重复解码；导出字节保持不变。']};
      }else if(starts(b,'CTENFDAM')||ext==='ncm'){
        diagnostic.decoder='ncm';r=await ncm(b,progress);
      }else if(QMC_EXT.has(ext)){
        diagnostic.decoder='qmc-legacy';r=await qmc(b,progress);
      }else if(ext==='kwm'){
        diagnostic.decoder='kwm';r=await kwm(b,progress);
      }else if(ext==='xm'||starts(b,'ifmt')){
        diagnostic.decoder='xm';r=await xm(b,progress);
      }else if(['tm0','tm2','tm3','tm6'].includes(ext)){
        diagnostic.decoder='tm-legacy';
        checkRange(b,0,32,'TM');const bytes=b.slice();bytes.set([0,0,0,32,0x66,0x74,0x79,0x70]);
        r={bytes,kind:'TM 头部修复',warnings:['仅适用于旧版 TM；未执行重新编码。']};
      }else if(['mflac','mgg','kgm','kgma','vpr','qmc','qmc4','qmc6','qmc8'].includes(ext)||String(name).toLowerCase().endsWith('.cache')){
        throw diagnosticError('本 Demo 未集成该格式或版本的离线解码器：.'+ext+'。不会发起在线查询。','UNSUPPORTED_FORMAT');
      }else if(RAW_EXT.has(ext)||sniff(b)){
        diagnostic.decoder='raw';r={bytes:b,kind:'原样导出',warnings:['普通音频仅检查并原样导出；不转码、不提升音质。']};
      }else throw diagnosticError('不支持的文件格式：'+diagnostic.inputExtension,'UNSUPPORTED_FORMAT');
      diagnostic.stage='audio-header';diagnostic.outputBytes=r.bytes.length;diagnostic.outputSignature=signature(r.bytes);
      const probe=probeAudio(r.bytes),format=probe.format;
      diagnostic.probe=probe;
      if(!format){
        const code=probe.issue||'AUDIO_HEADER_UNRECOGNIZED';
        const reason=probe.issue?'前置 ID3 标签不完整或不受支持。':'未识别到有效音频头；暂不能区分加密版本不支持、内部编码不支持或数据不完整。';
        throw diagnosticError(reason+' ['+code+' · '+diagnostic.inputExtension+' · '+diagnostic.decoder+'] 原文件未改动，可点「查看诊断」。',code);
      }
      diagnostic.stage='audio-validation';validateAudio(r.bytes,format);
      const parsed=localMetadata(r.bytes,format);r.metadata={...parsed,...Object.fromEntries(Object.entries(r.metadata||{}).filter(([,v])=>v))};
      r.metadata.title=r.metadata.title||String(name).replace(/\.[^.]+$/,'');r.metadata.artist=r.metadata.artist||'';r.metadata.album=r.metadata.album||'';
      if(probe.tagBytes&&format!=='mp3')r.warnings=[...(r.warnings||[]),'识别到前置 ID3 标签，已保留全部字节；不同播放器的兼容性可能不同。'];
      diagnostic.stage='complete';diagnostic.code='OK';
      progress(100);
      return {...r,format,mime:MIME[format],warnings:r.warnings||[],cover:r.cover||null,diagnostics:diagnostic};
    }catch(error){
      const e=error instanceof Error?error:new Error(String(error));
      if(e.message==='CANCELLED')throw e;
      e.code=e.code||(diagnostic.stage==='decode'?'DECODE_FAILED':diagnostic.stage==='audio-validation'?'AUDIO_VALIDATION_FAILED':'INPUT_FAILED');
      e.diagnostics={...diagnostic,code:e.code};throw e;
    }
  }
  root.OfflineMusicEngine={decode,MAX_FILE,MIME,sniff,probeAudio,validateAudio,aesEcbDecrypt,keyStream,mask128,cleanText};
  if(typeof module==='object'&&module.exports)module.exports=root.OfflineMusicEngine;
})(typeof globalThis!=='undefined'?globalThis:this);
