"""Generate an original, deterministic demo melody; no commercial recording."""
import math, struct, wave, subprocess
from pathlib import Path
root=Path(__file__).resolve().parents[1]
target=root/'samples'; target.mkdir(exist_ok=True)
sr=32000; seconds=4.2
notes=[523.251,659.255,783.991,987.767,783.991,659.255,587.330,523.251]
with wave.open(str(target/'original.wav'),'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
    frames=bytearray()
    for n in range(round(seconds*sr)):
        t=n/sr; v=0.0
        for j,f in enumerate(notes):
            s=t-j*0.42
            if 0<=s<1.2:
                envelope=min(1,s/0.012)*math.exp(-4.5*s)*min(1,(1.2-s)/0.1)
                v+=(math.sin(2*math.pi*f*s)+0.20*math.sin(2*math.pi*2.003*f*s))*envelope*0.18
        v*=min(1,(seconds-t)/0.2)
        frames.extend(struct.pack('<h',round(max(-1,min(1,v))*32767)))
    w.writeframes(frames)
for ext,codec in [('mp3',['-c:a','libmp3lame','-b:a','80k']),('flac',['-c:a','flac']),('ogg',['-c:a','libvorbis']),('m4a',['-c:a','aac']),('aac',['-c:a','aac','-f','adts'])]:
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(target/'original.wav'),*codec,'-metadata','title=Glass Garden','-metadata','artist=Offline Demo',str(target/f'original.{ext}')],check=True)
print('Generated original audio fixtures')
