// Evaluate in the performance preview's development page. Uses the visible
// renderer and rig; it is intentionally independent of screenshots/art approval.
(() => {
 const p=window.__performance;
 const result={frames:0,maxPalmTargetError:0,maxGripError:0,maxReachError:0,peakTasteSurfaceGap:0,finite:true,seekDeterministic:true};
 const signature=()=>{
  const values=[];
  p.rigs[1].root.traverse(object=>{
   if(object.isBone)for(const value of object.quaternion)values.push(value);
   if(object.isMesh)for(const value of object.geometry.attributes.position.array)values.push(value);
  });
  return values;
 };
 for(const mode of ['face','hold','clap']){
  p.setMode(mode);
  for(let i=0;i<=120;i++){
   p.setTime(i*.1);result.frames++;
   const contact=p.rigs[1].root.userData.contacts;
   if(mode==='clap')result.maxPalmTargetError=Math.max(result.maxPalmTargetError,Math.abs(contact.palmSeparation-contact.targetSeparation));
   if(mode==='hold'){
    result.maxGripError=Math.max(result.maxGripError,contact.gripError);
    result.maxReachError=Math.max(result.maxReachError,contact.reachError);
    if(contact.taste>.99999)result.peakTasteSurfaceGap=Math.max(result.peakTasteSurfaceGap,contact.surfaceGap);
   }
   p.rigs[1].root.traverse(object=>{
    if(object.isMesh)for(const name of ['position','normal'])for(const value of object.geometry.attributes[name]?.array??[])if(!Number.isFinite(value))result.finite=false;
   });
  }
  p.setTime(1.5);const first=signature();p.setTime(8.5);p.setTime(1.5);
  if(signature().some((value,i)=>Math.abs(value-first[i])>1e-7))result.seekDeterministic=false;
 }
 p.setMode('face');p.setTime(2.95);
 return result;
})()
