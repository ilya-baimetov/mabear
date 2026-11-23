import * as THREE from 'three';
import type {ActorId} from '../../shared/schema';
import type {CharacterRig,FrameState,ObjectContact} from '../api';
import {contactHands} from './contactHands';

/** Authored contacts use the same measured paws as prop pickups. No retained
 * solver state: a seek reconstructs the panel and hand from the same timestamp. */
export function applyObjectContacts(rigs:Record<ActorId,CharacterRig>,frame:FrameState):void {
 for(const [id,rig] of Object.entries(rigs) as [ActorId,CharacterRig][]){
  delete rig.root.userData.objectContact;
  delete rig.root.userData.objectContacts;
  const actor=frame.actors[id];
  if(!actor)continue;
  const list:ObjectContact[]=[...(actor.objectContacts??[])];
  if(actor.objectContact&&!list.some(c=>c.side===actor.objectContact!.side))list.push(actor.objectContact);
  const hands=contactHands.get(rig.root);
  if(!list.length||!hands)continue;
  const active=list.filter(c=>c.strength>0);
  if(!active.length)continue;
  rig.root.updateMatrixWorld(true);
  const rootPos=rig.root.getWorldPosition(new THREE.Vector3());
  const up=new THREE.Vector3(0,1,0);
  const results=[];
  for(const contact of active){
   const hand=hands.find(h=>h.side===contact.side);
   if(!hand)continue;
   const target=new THREE.Vector3(...contact.position);
   const normal=target.clone().sub(rootPos);normal.y=0;
   if(normal.lengthSq()<1e-8)normal.set(Math.sin(actor.yaw),0,Math.cos(actor.yaw));
   else normal.normalize();
   const pole=contact.pole?new THREE.Vector3(...contact.pole):undefined;
   const result=hand.place(target,up,normal,contact.strength,pole);
   results.push({side:contact.side,strength:contact.strength,error:result.error,gap:result.point.distanceTo(target),target:target.toArray(),point:result.point.toArray()});
  }
  if(results.length){
   rig.root.userData.objectContact=results[0];
   rig.root.userData.objectContacts=results;
  }
 }
}
