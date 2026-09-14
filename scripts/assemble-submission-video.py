"""Assemble actual public-browser recordings with local Chinese narration.
Run with .cache/video-tools/bin/python; requires imageio-ffmpeg.
"""
from pathlib import Path
import json, subprocess, re
from imageio_ffmpeg import get_ffmpeg_exe
ROOT=Path(__file__).resolve().parents[1]
D=ROOT/'artifacts/submission-final'
FF=get_ffmpeg_exe()

def run(args):
    r=subprocess.run([FF,'-y','-hide_banner','-loglevel','error',*args],capture_output=True,text=True)
    if r.returncode: raise RuntimeError(r.stderr[-5000:])

def duration(path):
    r=subprocess.run([FF,'-i',str(path)],capture_output=True,text=True)
    h,m,s=map(float,re.search(r'Duration: (\d+):(\d+):([\d.]+)',r.stderr).groups())
    return h*3600+m*60+s

def stamp(t,ass=False):
    h=int(t//3600);m=int(t%3600//60);s=t%60
    return f'{h}:{m:02}:{s:05.2f}' if ass else f'{h:02}:{m:02}:{int(s):02},{int((s%1)*1000):03}'

raw={x['name']:x for x in json.loads((D/'raw/manifest.json').read_text())}
narration=json.loads((D/'narration.json').read_text())
style='''[Script Info]
ScriptType: v4.00+
PlayResX: 1600
PlayResY: 1200
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial Unicode MS,32,&H00FFFFFF,&H00FFFFFF,&H00102020,&H00102020,0,0,0,0,100,100,0,0,1,1,0,2,60,60,24,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
chapters=[];srt=[];elapsed=0
for name,title,words in narration:
    sound=D/(name+'.aiff');ad=duration(sound)
    source=raw.get(name)
    length=max(ad+1.4,source['duration'] if source else 0)
    chunks=[x for x in re.split(r'(?<=[。！？])',words) if x]
    # Long sentences break on punctuation, not arbitrary word boundaries.
    chunks=[piece for chunk in chunks for piece in (re.split(r'(?<=，)',chunk) if len(chunk)>36 else [chunk])]
    total=sum(map(len,chunks));cursor=.3;events=[]
    for chunk in chunks:
        end=min(ad+.3,cursor+ad*len(chunk)/total)
        events.append(f'Dialogue: 0,{stamp(cursor,True)},{stamp(end,True)},Default,,0,0,0,,{chunk}')
        srt.append(f'{len(srt)+1}\n{stamp(elapsed+cursor)} --> {stamp(elapsed+end)}\n{chunk}\n')
        cursor=end
    ass=D/(name+'.ass');ass.write_text(style+'\n'.join(events)+'\n')
    vf="scale=1494:1120:force_original_aspect_ratio=decrease,pad=1600:1200:(ow-iw)/2:0:color=0x102b28,setsar=1,fps=30"
    if source:
        inp=['-ss',str(max(0,source['start']-.2)),'-t',str(source['duration']),'-i',source['path']]
        vf+=f',tpad=stop_mode=clone:stop_duration={length}'
    else:
        still=ROOT/'docs/submission/cover.png' if name=='00-intro' else D/'outro.png'
        inp=['-loop','1','-i',str(still)]
    vf+=f",subtitles=filename='{ass.as_posix()}'"
    output=D/(name+'.mp4')
    run([*inp,'-i',str(sound),'-vf',vf,'-af','apad','-t',f'{length:.3f}','-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-ar','48000','-ac','2','-movflags','+faststart',str(output)])
    chapters.append({'name':name,'title':title,'start':round(elapsed,3),'duration':round(length,3),'narration':words,'browserRecording':bool(source)})
    elapsed+=length
    print(f'{name}: {length:.1f}s',flush=True)
(D/'chapters.json').write_text(json.dumps(chapters,ensure_ascii=False,indent=2))
(D/'subtitles.srt').write_text('\n'.join(srt))
concat=D/'concat.txt';concat.write_text('\n'.join("file '"+(D/(x['name']+'.mp4')).as_posix()+"'" for x in chapters))
run(['-f','concat','-safe','0','-i',str(concat),'-c','copy','-movflags','+faststart',str(D/'一答一世界-实际演示.mp4')])
print(f'Final duration {elapsed:.2f}s',flush=True)
