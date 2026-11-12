import type * as THREE from 'three';

/** Reuses the same measured palm/paw surface for props and actor contacts. */
export interface ContactHand {
 side:1|-1;
 place(target:THREE.Vector3,long:THREE.Vector3,normal:THREE.Vector3,strength:number,pole?:THREE.Vector3):{error:number;point:THREE.Vector3};
}
export const contactHands=new WeakMap<THREE.Object3D,ContactHand[]>();
