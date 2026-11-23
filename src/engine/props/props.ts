// Props (spec §6.1): one charming multi-material procedural mesh per PropId (a stand-in for the production prop asset),
// placed every frame from FrameState.props — resting on the set, or attached to an actor's hand socket.
// Each prop is ONE BufferGeometry-grouped mesh named `prop:${id}`, origin at its base so it sits on surfaces.
import * as THREE from "three";
import { PROP_CONTACTS } from "../../shared/propContacts";
import { PROP_IDS, type ActorId, type PropId } from "../../shared/schema";
import type { ActorFrame, PropFrame } from "../api";
import type { LookMaterials } from "../look";
import { createCookingPancake } from "./cookingPancake";
import { createFishingLine } from "./fishingLine";
import { PROP_SLOTS, restPlacement, restingMark } from "./propPlacement";
import {
  PENDULUM_PROPS,
  PROP_VISUALS,
  buildPropMesh,
  createPropPalette,
  type PropPalette,
  type PropVisual,
  type R3,
} from "./propRecipes";

export { PROP_SLOTS, PROP_VISUALS, buildPropMesh, restPlacement, restingMark, type PropPalette, type PropVisual, type R3 };

export interface PropsHandle {
  root: THREE.Group;
  objects: Record<PropId, THREE.Object3D>;
  /**
   * Place every prop from the frame. `sockets` are the actors' hand sockets; `yaws` their facing (props are held
   * upright in the actor's yaw frame, which reads well with any hand orientation).
   */
  apply(props: Record<PropId, PropFrame>, sockets: Partial<Record<ActorId, THREE.Object3D>>, yaws: Partial<Record<ActorId, number>>, actors?: Partial<Record<ActorId, ActorFrame>>): void;
  dispose(): void;
}

const _wp = new THREE.Vector3();
const _off = new THREE.Vector3();
const _yq = new THREE.Quaternion();
const _yqInv = new THREE.Quaternion();
const _tiltLocal = new THREE.Quaternion();
const _tiltWorld = new THREE.Quaternion();
const _tiltEuler = new THREE.Euler(0, 0, 0, "YXZ");
const _gripOff = new THREE.Vector3();
const _pivotWorld = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export function createProps(mats: LookMaterials): PropsHandle {
  const root = new THREE.Group();
  root.name = "props";
  const palette = createPropPalette(mats);
  const objects = {} as Record<PropId, THREE.Object3D>;
  const cache = {} as Record<PropId, { x: number; y: number; z: number; p: THREE.Vector3; r: THREE.Euler }>;
  for (const id of PROP_IDS) {
    cache[id] = { x: NaN, y: NaN, z: NaN, p: new THREE.Vector3(), r: new THREE.Euler(0, 0, 0, "YXZ") };
    const holder = new THREE.Group();
    holder.name = `prop:${id}:holder`;
    holder.rotation.order = "YXZ";
    holder.add(buildPropMesh(id, mats, palette));
    holder.visible = false;
    root.add(holder);
    objects[id] = holder;
  }
  const panMesh = objects.frying_pan.getObjectByName("prop:frying_pan") ?? objects.frying_pan;
  const pancake = createCookingPancake(panMesh, palette.matteFood);
  const fishing = createFishingLine(objects.fishing_rod);

  return {
    root,
    objects,
    apply(props, sockets, yaws, actors) {
      for (const id of PROP_IDS) {
        const o = objects[id];
        const f = props?.[id];
        if (!f || !f.visible) {
          o.visible = false;
          if (id === "frying_pan") pancake.hide();
          continue;
        }
        o.visible = true;
        const socket = f.attachedTo ? sockets[f.attachedTo] : undefined;
        const actor = f.attachedTo ? actors?.[f.attachedTo] : undefined;
        if (f.attachedTo && socket) {
          if (socket.userData.preciseGrip) {
            socket.getWorldPosition(o.position);
            socket.getWorldQuaternion(o.quaternion);
          } else {
            const yaw = yaws[f.attachedTo] ?? 0;
            socket.getWorldPosition(_wp);
            const g = PROP_VISUALS[id].grip;
            _yq.setFromAxisAngle(_up, yaw);
            _off.set(g.pos[0], g.pos[1], g.pos[2]).applyQuaternion(_yq);
            o.position.copy(_wp).add(_off);
            o.rotation.set(g.rot[0], yaw + g.rot[1], g.rot[2]);
          }
          if (PENDULUM_PROPS.has(id) && actor?.spring && !actor.pickup && !actor.putDown) {
            const sp = actor.spring;
            const pitch = THREE.MathUtils.clamp(sp.swayZ * 0.16 + sp.bounceY * 0.04 * Math.sin(sp.time * 6.5), -0.24, 0.24);
            const roll = THREE.MathUtils.clamp(-sp.swayX * 0.16 - sp.yawVel * 0.035, -0.24, 0.24);
            if (pitch !== 0 || roll !== 0) {
              const yaw = yaws[f.attachedTo] ?? actor.yaw;
              _yq.setFromAxisAngle(_up, yaw);
              _yqInv.copy(_yq).invert();
              _tiltLocal.setFromEuler(_tiltEuler.set(pitch, 0, roll, "YXZ"));
              _tiltWorld.copy(_yq).multiply(_tiltLocal).multiply(_yqInv);
              const gp = PROP_CONTACTS[id].point;
              _gripOff.set(gp[0], gp[1], gp[2]).applyQuaternion(o.quaternion);
              _pivotWorld.copy(o.position).add(_gripOff);
              o.quaternion.premultiply(_tiltWorld);
              _gripOff.set(gp[0], gp[1], gp[2]).applyQuaternion(o.quaternion);
              o.position.copy(_pivotWorld).sub(_gripOff);
            }
          }
        } else if (f.rotation) {
          o.position.fromArray(f.pos);
          o.quaternion.fromArray(f.rotation);
        } else {
          // cache: resting placement only changes when the player's position does (no per-frame allocation)
          const c = cache[id];
          if (c.x !== f.pos[0] || c.y !== f.pos[1] || c.z !== f.pos[2]) {
            const p = restPlacement(id, f.pos);
            c.x = f.pos[0];
            c.y = f.pos[1];
            c.z = f.pos[2];
            c.p.set(p.pos[0], p.pos[1], p.pos[2]);
            c.r.set(p.rot[0], p.rot[1], p.rot[2], "YXZ");
          }
          o.position.copy(c.p);
          o.rotation.copy(c.r);
        }
        if (id === "fishing_rod") fishing.update(actor, Boolean(f.attachedTo));
        if (id === "frying_pan") pancake.update(actor);
      }
    },
    dispose() {
      fishing.dispose();
      for (const m of palette.owned) m.dispose();
      root.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
    },
  };
}
