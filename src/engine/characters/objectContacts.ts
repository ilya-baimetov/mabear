import * as THREE from 'three';
import type {ActorId} from '../../shared/schema';
import type {CharacterRig,FrameState} from '../api';
import {contactHands} from './contactHands';

/** Authored contacts use the same measured paws as prop pickups. No retained
 * solver state: a seek reconstructs the panel and hand from the same timestamp. */
export function applyObjectContacts(rigs:Record<ActorId,CharacterRig>,frame:FrameState):void {
 for(const [id,rig] of Object.entries(rigs) as [ActorId,CharacterRig][]){
  delete rig.root.userData.objectContact;
  const contact=frame.actors[id]?.objectContact;if(!contact||contact.strength<=0)continue;
  const hand=contactHands.get(rig.root)?.find(h=>h.side===contact.side);if(!hand)continue;
  rig.root.updateMatrixWorld(true);
  const target=new THREE.Vector3(...contact.position);
  const normal=target.clone().sub(rig.root.getWorldPosition(new THREE.Vector3()));normal.y=0;normal.normalize();
  const result=hand.place(target,new THREE.Vector3(0,1,0),normal,contact.strength);
  rig.root.userData.objectContact={side:contact.side,strength:contact.strength,error:result.error,gap:result.point.distanceTo(target),target:target.toArray(),point:result.point.toArray()};
 }
}
