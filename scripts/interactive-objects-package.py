from pathlib import Path
import json, subprocess, hashlib
root=Path(__file__).resolve().parents[1];d=root/'docs/interactive-objects'
ffmpeg=subprocess.check_output(['/tmp/mabear-media-check-env/bin/python','-c','import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())'],text=True).strip()
proof=json.loads((d/'after/proof.json').read_text())
for name in ['entry','approach']:
 duration=next(r['duration'] for r in proof['recordings'] if r['id']==name)
 subprocess.run([ffmpeg,'-v','error','-y','-i',str(d/'before'/f'{name}.mp4'),'-i',str(d/'after'/f'{name}.mp4'),'-filter_complex',f'[0:v]fps=30,scale=960:576,setsar=1,tpad=stop_mode=clone:stop_duration=40[l];[1:v]fps=30,scale=960:576,setsar=1[r];[l][r]hstack=inputs=2[v]','-map','[v]','-t',str(duration),'-c:v','libx264','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(d/f'{name}-comparison.mp4')],check=True)
(d/'montage-input.txt').write_text("file 'entry-comparison.mp4'\nfile 'approach-comparison.mp4'\n")
subprocess.run([ffmpeg,'-v','error','-y','-f','concat','-safe','0','-i',str(d/'montage-input.txt'),'-c','copy','-movflags','+faststart',str(d/'before-after.mp4')],check=True)
media=[]
for video in [*d.glob('*comparison.mp4'),d/'before-after.mp4',*d.glob('before/*.mp4'),*d.glob('after/*.mp4')]:
 subprocess.run([ffmpeg,'-v','error','-xerror','-i',str(video),'-an','-f','null','-'],check=True,capture_output=True)
 subprocess.run([ffmpeg,'-v','error','-xerror','-sseof','-2','-i',str(video),'-an','-f','null','-'],check=True,capture_output=True)
 media.append({'file':str(video.relative_to(d)),'bytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'fullDecode':True,'tailDecode':True})
(d/'media-check.json').write_text(json.dumps(media,indent=2))
subprocess.run([ffmpeg,'-v','error','-y','-i',str(d/'after/roundtrip.mp4'),'-vf','fps=1/3,scale=480:288,tile=4x4','-frames:v','1',str(d/'roundtrip-contact-sheet.png')],check=True)
print(json.dumps({'media':len(media),'comparison':str(d/'before-after.mp4')}))
