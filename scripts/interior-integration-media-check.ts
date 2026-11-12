import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,stat} from 'node:fs/promises';
import sharp from 'sharp';
const ffmpeg=process.env.FFMPEG_PATH??execFileSync('/tmp/mabear-media-check-env/bin/python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const version=execFileSync(ffmpeg,['-version'],{encoding:'utf8'}).split('\n')[0];
const dir='docs/interior-integration';await mkdir(`${dir}/media-check`,{recursive:true});const results=[];
for(const path of ['before/cozy_evening_en.mp4','before/kitchen_visit.mp4','after/cozy_evening_en.mp4','after/kitchen_visit.mp4','comparison/interior-before-after.mp4']){
 const file=`${dir}/${path}`;
 // MediaRecorder writes variable frame timestamps. Preserve their time base
 // while decoding, rather than rounding nearby frames into the same null-mux DTS.
 const progress=execFileSync(ffmpeg,['-v','error','-xerror','-i',file,'-an','-fps_mode','passthrough','-enc_time_base','demux','-progress','pipe:1','-nostats','-f','null','-'],{encoding:'utf8',maxBuffer:10_000_000});
 const frames=Number([...progress.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]),decodedUs=Number([...progress.matchAll(/^out_time_us=(\d+)/gm)].at(-1)?.[1]);
 if(!Number.isFinite(frames)||frames<30||!Number.isFinite(decodedUs)||decodedUs<1_000_000)throw new Error(`Insufficient decoded media: ${path}`);
 const tailProgress=execFileSync(ffmpeg,['-v','error','-xerror','-sseof','-2','-i',file,'-an','-fps_mode','passthrough','-enc_time_base','demux','-progress','pipe:1','-nostats','-f','null','-'],{encoding:'utf8',maxBuffer:10_000_000});
 const tailFrames=Number([...tailProgress.matchAll(/^frame=(\d+)/gm)].at(-1)?.[1]);if(tailFrames<15)throw new Error(`Tail failed to decode: ${path}`);
 const png=execFileSync(ffmpeg,['-v','error','-sseof','-0.20','-i',file,'-frames:v','1','-f','image2pipe','-c:v','png','-'],{maxBuffer:20_000_000});
 const image=sharp(png),metadata=await image.metadata(),stats=await image.stats();if(stats.channels.slice(0,3).every(c=>c.stdev<3))throw new Error(`Flat/blank tail frame: ${path}`);
 const thumbnail=path.replaceAll('/','-').replace('.mp4','.png');await writeFile(`${dir}/media-check/${thumbnail}`,png);
 const result={path,bytes:(await stat(file)).size,frames,decodedSeconds:decodedUs/1e6,tailFrames,tailDimensions:[metadata.width,metadata.height],tailChannelStandardDeviation:stats.channels.slice(0,3).map(c=>c.stdev)};results.push(result);console.log(JSON.stringify(result));
}
await writeFile(`${dir}/media-check/proof.json`,JSON.stringify({ffmpeg:version,verifiedAt:new Date().toISOString(),decodeMode:'Full and final-two-second decode; fail on errors; preserve native variable frame timestamps and demuxer time base',results,errors:[]},null,2));
