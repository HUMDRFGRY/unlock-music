// Independent fixture encryption uses Node crypto. Offline, no npm dependencies.
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');const path=require('node:path');
const E=require('../src/engine.js');const root=path.join(__dirname,'..');
const u=s=>new Uint8Array(Buffer.from(s));
const core=Buffer.from('hzHRAmso5kInbaxW');const meta=Buffer.from('2331346c6a6b5f215c5d2630553c2728','hex');
const le=n=>{const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;};
const aes=(b,k)=>{const c=crypto.createCipheriv('aes-128-ecb',k,null);return Buffer.concat([c.update(b),c.final()]);};
function streamReference(key){
 let s=Array.from({length:256},(_,i)=>i),j=0;
 for(let i=0;i<256;i++){j=(j+s[i]+key[i%key.length])%256;[s[i],s[j]]=[s[j],s[i]];}
 return Array.from({length:256},(_,i)=>{const t=(i+1)%256;return s[(s[t]+s[(s[t]+t)%256])%256];});
}
function packNcm(audio,metadata={musicName:'Glass Garden · 玻璃花园',artist:[['Offline Demo',0]],album:'Original synth / 原创合成演示',format:'mp3',albumPic:'https://example.invalid/never-request-this.jpg'},cover=Buffer.alloc(0)){
 const key=Buffer.from('offline-demo-audio-key-2026'),encKey=aes(Buffer.concat([Buffer.from('neteasecloudmusic'),key]),core).map(x=>x^0x64);
 const encMeta=metadata===null?Buffer.alloc(0):Buffer.from("163 key(Don't modify):"+aes(Buffer.from('music:'+JSON.stringify(metadata)),meta).toString('base64')).map(x=>x^0x63);
 const ks=streamReference(key),cipher=Buffer.from(audio).map((v,i)=>v^ks[i%256]);
 const header=Buffer.concat([Buffer.from('CTENFDAM'),Buffer.alloc(2),le(encKey.length),encKey,le(encMeta.length),encMeta,Buffer.alloc(5),le(cover.length),le(cover.length),cover]);
 return Buffer.concat([header,cipher]);
}
// Literal matrix from upstream; index generation is separate from the production transform.
const default44=[222,81,250,195,74,214,202,144,126,103,94,247,213,82,132,216,71,149,187,161,170,198,102,35,146,98,243,116,161,159,244,160,29,63,91,240,19,14,9,61,249,188,0,17];
function qmcReference(b){
 const xs=Array.from(new Set(Array.from({length:128},(_,i)=>(i*i+27)%256))).sort((a,b)=>a-b);
 const matrix=Array.from({length:128},(_,i)=>default44[xs.indexOf((i*i+27)%256)]);
 // Upstream's skipped mask position at each 0x8000 boundary.
 return Buffer.from(b).map((v,i)=>{const offset=i<0x8000?i:i+Math.floor(i/0x7fff);return v^matrix[offset%128];});
}
function packKwm(audio){const h=Buffer.alloc(1024);h.write('yeelion-kuwo-tme');h.writeBigUInt64LE(1234567890123456789n,24);const k='1234567890123456789'.repeat(2).slice(0,32),p='MoOtOiTvINGwd2E6n0E1i7L5t2IoOoNk';return Buffer.concat([h,Buffer.from(audio).map((v,i)=>v^k.charCodeAt(i%32)^p.charCodeAt(i%32))]);}
function packXm(audio){const h=Buffer.alloc(16);h.write('ifmt MP3');h.fill(254,8,12);h[12]=12;h[15]=83;return Buffer.concat([h,Buffer.from(audio).map((v,i)=>i<12?v:((v^255)+83)&255)]);}
let results=[];
async function test(name,fn){await fn();results.push({name,status:'PASS'});console.log('PASS',name);}
(async()=>{
 await test('AES-128 NIST known-answer vector',()=>{assert.deepEqual(Buffer.from(E.aesEcbDecrypt(Buffer.from('69c4e0d86a7b0430d8cdb78070b4c55a','hex'),Buffer.from('000102030405060708090a0b0c0d0e0f','hex'),false)),Buffer.from('00112233445566778899aabbccddeeff','hex'));});
 await test('AES-128 ECB / PKCS7 against Node crypto (32 cases)',()=>{for(let i=0;i<32;i++){const k=crypto.randomBytes(16),p=crypto.randomBytes(i*37);assert.deepEqual(Buffer.from(E.aesEcbDecrypt(aes(p,k),k)),p);}});
 await test('AES rejects invalid block length / padding',()=>{assert.throws(()=>E.aesEcbDecrypt(new Uint8Array(7),core));assert.throws(()=>E.aesEcbDecrypt(new Uint8Array(16),core));});
 const mp3=fs.readFileSync(path.join(root,'samples/original.mp3'));
 const ncm=packNcm(mp3),qmc=qmcReference(mp3),kwm=packKwm(mp3);
 for(const [name,b] of [['Glass Garden.ncm',ncm],['Glass Garden.qmc3',qmc],['Glass Garden.kwm',kwm]])fs.writeFileSync(path.join(root,'samples',name),b);
 const demo=[['Glass Garden.ncm',ncm],['Glass Garden.qmc3',qmc],['Glass Garden.kwm',kwm]].map(([name,b])=>({name,data:b.toString('base64')}));
 fs.writeFileSync(path.join(root,'src/demo-data.json'),JSON.stringify(demo));
 await test('NCM real MP3 payload + local metadata: exact bytes',async()=>{const r=await E.decode(ncm,'test.ncm');assert.equal(r.format,'mp3');assert.equal(r.metadata.title,'Glass Garden · 玻璃花园');assert.deepEqual(Buffer.from(r.bytes),mp3);assert.ok(!('albumPic' in r.metadata));});
 await test('NCM with absent metadata',async()=>{assert.deepEqual(Buffer.from((await E.decode(packNcm(mp3,null),'none.ncm')).bytes),mp3);});
 await test('NCM embedded PNG cover is extracted locally',async()=>{const png=Buffer.from('89504e470d0a1a0a00000000','hex');const r=await E.decode(packNcm(mp3,{},png),'cover.ncm');assert.equal(r.cover.mime,'image/png');assert.deepEqual(Buffer.from(r.cover.bytes),png);});
 await test('NCM invalid optional metadata does not discard valid audio',async()=>{const b=Buffer.from(ncm);const keyLen=b.readUInt32LE(10);const off=14+keyLen+4;b[off]^=1;const r=await E.decode(b,'tags.ncm');assert.equal(r.warnings.length,1);assert.deepEqual(Buffer.from(r.bytes),mp3);});
 await test('NCM FLAC payload: exact bytes',async()=>{const flac=fs.readFileSync(path.join(root,'samples/original.flac'));const r=await E.decode(packNcm(flac,{format:'flac'}),'test.ncm');assert.equal(r.format,'flac');assert.deepEqual(Buffer.from(r.bytes),flac);});
 await test('QMC3 MP3: exact bytes across 32768 boundary',async()=>{assert.ok(mp3.length>32768);assert.deepEqual(Buffer.from((await E.decode(qmc,'test.qmc3')).bytes),mp3);});
 await test('QMC variants with WAV > 8 mask boundaries',async()=>{const wave=fs.readFileSync(path.join(root,'samples/original.wav'));assert.ok(wave.length>8*32768);assert.deepEqual(Buffer.from((await E.decode(qmcReference(wave),'test.776176')).bytes),wave);});
 await test('QMCFLAC / QMC2 / MOO payloads',async()=>{for(const [src,ext] of [['flac','qmcflac'],['ogg','qmc2'],['mp3','bkcmp3'],['flac','bkcflac']]){const b=fs.readFileSync(path.join(root,`samples/original.${src}`));const r=await E.decode(qmcReference(b),'test.'+ext);assert.equal(r.format,src);assert.deepEqual(Buffer.from(r.bytes),b);}});
 await test('KWM payload: exact bytes',async()=>assert.deepEqual(Buffer.from((await E.decode(kwm,'test.kwm')).bytes),mp3));
 await test('XM payload: exact bytes',async()=>assert.deepEqual(Buffer.from((await E.decode(packXm(mp3),'test.xm')).bytes),mp3));
 await test('Raw MP3 / FLAC / WAV / OGG / M4A / AAC unchanged',async()=>{for(const ext of ['mp3','flac','wav','ogg','m4a','aac']){const b=fs.readFileSync(path.join(root,`samples/original.${ext}`));const r=await E.decode(b,'test.'+ext);assert.equal(r.format,ext);assert.deepEqual(Buffer.from(r.bytes),b);}});
 await test('Local ID3 / FLAC title parsing',async()=>{for(const ext of ['mp3','flac']){const r=await E.decode(fs.readFileSync(path.join(root,`samples/original.${ext}`)),'file.'+ext);assert.equal(r.metadata.title,'Glass Garden');assert.equal(r.metadata.artist,'Offline Demo');}});
 await test('Unsupported modern / KGM formats reject explicitly',async()=>{for(const ext of ['mflac','mgg','kgm','vpr','cache'])await assert.rejects(()=>E.decode(mp3,'a.'+ext),/未集成/);});
 await test('Truncated NCM headers / length overflow reject',async()=>{for(const n of [0,1,8,10,14,60,200])await assert.rejects(()=>E.decode(ncm.slice(0,n),'bad.ncm'));const b=Buffer.from(ncm);b.writeUInt32LE(0xffffffff,10);await assert.rejects(()=>E.decode(b,'bad.ncm'));});
 await test('Damaged audio / fake extension is not reported successful',async()=>{for(const ext of ['mp3','ncm','qmc3','kwm','xm'])await assert.rejects(()=>E.decode(Buffer.alloc(200),'bad.'+ext));});
 await test('Truncated WAV / FLAC payload rejects',async()=>{for(const ext of ['wav','flac'])await assert.rejects(()=>E.decode(fs.readFileSync(path.join(root,`samples/original.${ext}`)).slice(0,50),'bad.'+ext));});
 await test('Random ciphertext is not mistaken for MP3 (64 samples)',async()=>{for(let i=0;i<64;i++){const b=crypto.randomBytes(65536);b[0]=0;b[1]=0;assert.notEqual(E.sniff(b),'mp3');await assert.rejects(()=>E.decode(b,'random.qmc3'));}});
 await test('Single-file size limit rejects before parsing',async()=>await assert.rejects(()=>E.decode(new Uint8Array(E.MAX_FILE+1),'large.wav'),/128 MiB/));
 await test('Progress finishes at 100',async()=>{let last=0;await E.decode(ncm,'p.ncm',p=>{assert.ok(p>=last);last=p;});assert.equal(last,100);});
 const report={engineTests:results.length,assertionCases:'Includes 32 AES randomized cross-checks and multiple formats / boundary cases.',sourceCommit:'dc518c5522bba43bd6248b58b56ecd1bb6058895',limitations:'Synthetic, independently encoded fixtures only; not a corpus of real platform downloads. Header validation is not a complete codec integrity check.',tests:results};
 fs.writeFileSync(path.join(root,'tests/engine-results.json'),JSON.stringify(report,null,2));
 console.log(`\n${results.length} test groups passed.`);
})().catch(e=>{console.error(e);process.exit(1);});
