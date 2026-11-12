"""Package captured browser footage; no generated animation or frame retiming."""
from pathlib import Path
import json, subprocess, hashlib
import imageio_ffmpeg

root=Path(__file__).resolve().parents[1]
d=root/'docs/cupboard'
ffmpeg=imageio_ffmpeg.get_ffmpeg_exe()
def run(*args):
    subprocess.run([ffmpeg,'-v','error','-y',*map(str,args)],check=True)

# Identical scene text. Each side starts at that scene's beginning at 1x.
# The unsupported before scene ends sooner; hold its final frame thereafter.
run('-i',d/'before/cupboard.mp4','-i',d/'after/cupboard.mp4','-filter_complex',
    '[0:v]trim=start=18.169:duration=6.094,setpts=PTS-STARTPTS,fps=30,scale=960:576,setsar=1,tpad=stop_mode=clone:stop_duration=9[l];'
    '[1:v]trim=start=18.169:duration=14.688,setpts=PTS-STARTPTS,fps=30,scale=960:576,setsar=1[r];'
    '[l][r]hstack=inputs=2[v]',
    '-map','[v]','-t','14.688','-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',d/'before-after.mp4')
run('-ss','24.857','-i',d/'after/cupboard.mp4','-t','8.0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',d/'cupboard-action.mp4')
run('-ss','24.857','-i',d/'after/cupboard.mp4','-t','8.0','-vf','fps=1,scale=480:288,tile=4x2','-frames:v','1',d/'action-contact-sheet.png')
run('-i',d/'after/cupboard.mp4','-vf','fps=1/3.5,scale=400:240,tile=4x3','-frames:v','1',d/'story-contact-sheet.png')
media=[]
for video in [d/'before-after.mp4',d/'cupboard-action.mp4',d/'before/cupboard.mp4',d/'after/cupboard.mp4']:
    for args in [[],['-sseof','-2']]:
        subprocess.run([ffmpeg,'-v','error','-xerror',*args,'-i',str(video),'-an','-f','null','-'],check=True,capture_output=True)
    media.append({'file':str(video.relative_to(d)),'bytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'fullDecode':True,'tailDecode':True})
(d/'media-check.json').write_text(json.dumps(media,indent=2))
print(json.dumps({'checked':len(media),'comparison':str(d/'before-after.mp4')}))
