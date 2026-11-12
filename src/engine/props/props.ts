// Props (spec §6.1): one small, charming procedural mesh per PropId (a stand-in for the production prop asset),
// placed every frame from FrameState.props — resting on the set, or attached to an actor's hand socket.
// Each prop is ONE vertex-coloured mesh (one draw call), origin at its base so it sits on surfaces.
import * as THREE from "three";
import { FISHING_WATER_TARGET, MARKS } from "../../shared/bible/set";
import { PROP_IDS, type ActorId, type MarkId, type PropId, type Vec3 } from "../../shared/schema";
import type { ActorFrame, PropFrame } from "../api";
import { GeoBag, bagToSingle, rng, xf, type LookMaterials } from "../look";
import { restHeightAt } from "../set/bearsYard";
import {PROP_SLOTS,PROP_REST_HEIGHT,propPlacementAtMark} from '../../shared/propPlacement';
import {HOUSE_PREP_TABLE,HOUSE_READING_TABLE} from '../../shared/houseLayout';
export {PROP_SLOTS} from '../../shared/propPlacement';

type R3 = [number, number, number];

interface PropVisual {
  build(b: GeoBag): void;
  /** offset from the hand socket in the actor's yaw frame (+z forward, +y up) */
  grip: { pos: R3; rot: R3 };
  /** rotation when resting (default upright) */
  restRot?: R3;
}

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, seg = 12) => new THREE.CylinderGeometry(rt, rb, h, seg);
const sph = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

export const PROP_VISUALS: Record<PropId, PropVisual> = {
  jam_jar: {
    build(b) {
      b.add("paint", lathe([[0, 0], [0.055, 0], [0.062, 0.02], [0.062, 0.1], [0.05, 0.115], [0.05, 0.125], [0, 0.125]]), 0xb51f3c, undefined, {
        colorFn: (p, _n, o) => { if (p.y > 0.035 && p.y < 0.075) o.setHex(0xf7ecd2); },
      });
      b.add("fabric", sph(0.068, 12, 6), 0xffffff, xf([0, 0.125, 0], [0, 0, 0], [1, 0.35, 1]), {
        colorFn: (p, _n, o) => { if ((Math.floor((p.x + 1) * 40) + Math.floor((p.z + 1) * 40)) % 2) o.setHex(0xd8283a); },
      });
      b.add("paint", cyl(0.054, 0.054, 0.012), 0xd8283a, xf([0, 0.118, 0]));
    },
    grip: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] },
  },
  honey_pot: {
    build(b) {
      b.add("paint", lathe([[0, 0], [0.07, 0], [0.1, 0.05], [0.105, 0.11], [0.08, 0.17], [0.075, 0.19], [0.085, 0.2], [0, 0.2]]), 0xc98a3a, undefined, {
        colorFn: (p, _n, o) => { if (p.y > 0.185) o.setHex(0xf5b22a); },
      });
      b.add("paint", sph(0.03, 8, 6), 0xf5b22a, xf([0.07, 0.17, 0.02], [0, 0, 0], [0.6, 1.4, 0.6]));
      b.add("wood", cyl(0.008, 0.008, 0.2, 5), 0xc89a60, xf([0.02, 0.24, 0], [0, 0, -0.35]));
    },
    grip: { pos: [0, -0.1, 0.06], rot: [0, 0, 0] },
  },
  pancakes: {
    build(b) {
      b.add("paint", cyl(0.15, 0.13, 0.015, 20), 0xffffff, xf([0, 0.0075, 0]));
      for (let i = 0; i < 6; i++) b.add("paint", cyl(0.11, 0.11, 0.016, 18), i % 2 ? 0xe2a750 : 0xeab862, xf([0.004 * (i % 3), 0.023 + i * 0.016, 0.003 * (i % 2)]));
      b.add("paint", box(0.04, 0.025, 0.04), 0xfff1a8, xf([0, 0.13, 0], [0, 0.4, 0]));
      b.add("paint", sph(0.05, 10, 6), 0xc41f3c, xf([0.03, 0.118, 0.02], [0, 0, 0], [1, 0.2, 1]));
    },
    grip: { pos: [0, -0.04, 0.12], rot: [0, 0, 0] },
  },
  frying_pan: {
    build(b) {
      b.add("metal", lathe([[0, 0], [0.12, 0], [0.135, 0.04], [0.128, 0.042], [0.115, 0.008], [0, 0.008]], 20), 0x2e2e30);
      b.add("wood", box(0.03, 0.025, 0.2), 0x6b3f22, xf([0, 0.03, -0.22], [0.12, 0, 0]));
      b.add("metal", box(0.025, 0.015, 0.06), 0x2e2e30, xf([0, 0.025, -0.13]));
    },
    grip: { pos: [0, -0.03, 0.26], rot: [0, 0, 0] },
  },
  ball: {
    build(b) {
      const cols = [0xd8283a, 0xffd84a, 0x3d7fc1, 0xffffff, 0xd8283a, 0xffd84a, 0x3d7fc1, 0xffffff];
      b.add("paint", sph(0.15, 24, 16), 0xffffff, xf([0, 0.15, 0]), {
        colorFn: (p, _n, o) => { const a = Math.atan2(p.z, p.x) + Math.PI; o.setHex(cols[Math.floor((a / (Math.PI * 2)) * 8) % 8]); if (Math.abs(p.y) > 0.138) o.setHex(0xffffff); },
      });
    },
    grip: { pos: [0, -0.06, 0.15], rot: [0, 0, 0] },
  },
  fishing_rod: {
    build(b) {
      b.add("wood", cyl(0.008, 0.016, 1.5, 6), 0xd9bb72, xf([0, 0.75, 0]), {
        colorFn: (p, _n, o) => { if (Math.abs(((p.y + 2) % 0.25) - 0.125) < 0.008) o.setHex(0x8a6a30); },
      });
      b.add("metal", cyl(0.03, 0.03, 0.03, 10), 0x777777, xf([0.03, 0.2, 0], [0, 0, Math.PI / 2]));
    },
    grip: { pos: [0, -0.02, 0.02], rot: [0.9, 0, 0] },
    restRot: [Math.PI / 2, 0, 0.3],
  },
  fish: {
    build(b) {
      b.add("paint", sph(0.08, 14, 10), 0x8fb4cc, xf([0, 0.05, 0], [0, 0, 0], [1.8, 0.75, 0.55]), {
        colorFn: (p, _n, o) => { if (p.y > 0.03) o.setHex(0x5f86a6); else if (p.y < -0.03) o.setHex(0xdfe8ee); },
      });
      b.add("paint", new THREE.ConeGeometry(0.06, 0.09, 4), 0x6f96b6, xf([-0.17, 0.05, 0], [0, 0, Math.PI / 2], [1, 1, 0.3]));
      b.add("paint", sph(0.014, 6, 5), 0x111111, xf([0.1, 0.065, 0.035]));
      b.add("paint", sph(0.014, 6, 5), 0x111111, xf([0.1, 0.065, -0.035]));
    },
    grip: { pos: [0, -0.05, 0.08], rot: [0, Math.PI / 2, 0] },
  },
  lollipop: {
    build(b) {
      b.add("paint", cyl(0.006, 0.006, 0.16, 5), 0xffffff, xf([0, 0.08, 0]));
      b.add("paint", cyl(0.065, 0.065, 0.025, 20), 0xffffff, xf([0, 0.2, 0], [Math.PI / 2, 0, 0]), {
        colorFn: (p, _n, o) => { const a = Math.atan2(p.z, p.x); const rr = Math.hypot(p.x, p.z); o.setHex(Math.sin(a * 1 + rr * 90) > 0 ? 0xff5fa2 : 0xfff2f8); },
      });
    },
    grip: { pos: [0, -0.02, 0.02], rot: [0, 0, 0] },
    restRot: [Math.PI / 2, 0, 0],
  },
  flowers: {
    build(b) {
      const heads = [0xffffff, 0xffd84a, 0xe8433a, 0x6b8cff, 0xff8fc0, 0xa070e0, 0xffffff];
      const r = rng(5);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const lean: R3 = [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25];
        b.add("foliage", cyl(0.005, 0.006, 0.3, 4), 0x4f8f3a, xf([Math.cos(a) * 0.02, 0.15, Math.sin(a) * 0.02], lean));
        const hx = Math.cos(a) * 0.02 - lean[2] * 0.15, hz = Math.sin(a) * 0.02 + lean[0] * 0.15;
        b.add("foliage", sph(0.035 + r() * 0.01, 8, 6), heads[i], xf([hx, 0.3, hz], [0, 0, 0], [1, 0.7, 1]));
      }
      b.add("fabric", cyl(0.028, 0.028, 0.04, 10), 0xd8283a, xf([0, 0.1, 0]));
    },
    grip: { pos: [0, -0.06, 0.04], rot: [0, 0, 0] },
    restRot: [Math.PI / 2.2, 0, 0],
  },
  carrot: {
    build(b) {
      b.add("paint", new THREE.ConeGeometry(0.04, 0.2, 10), 0xf07f2a, xf([0, 0.1, 0], [Math.PI, 0, 0]), {
        colorFn: (p, _n, o) => { if (Math.abs(((p.y + 1) % 0.04) - 0.02) < 0.003) o.multiplyScalar(0.8); },
      });
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        b.add("foliage", new THREE.ConeGeometry(0.02, 0.14, 5), 0x4f9e3a, xf([Math.cos(a) * 0.012, 0.27, Math.sin(a) * 0.012], [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]));
      }
    },
    grip: { pos: [0, -0.1, 0.05], rot: [0, 0, 0] },
    restRot: [Math.PI / 2, 0, 0.4],
  },
  broom: {
    build(b) {
      b.add("wood", cyl(0.016, 0.018, 1.05, 6), 0xb98a52, xf([0, 0.62, 0]));
      b.add("wood", new THREE.ConeGeometry(0.13, 0.4, 12, 1, true), 0xd8b25e, xf([0, 0.2, 0]), {
        colorFn: (p, _n, o) => { if (Math.sin(Math.atan2(p.z, p.x) * 20) > 0.6) o.multiplyScalar(0.8); },
      });
      b.add("fabric", cyl(0.045, 0.045, 0.04, 10), 0xd8283a, xf([0, 0.38, 0]));
    },
    grip: { pos: [0, -0.5, 0.06], rot: [0.25, 0, 0] },
    restRot: [-0.22, 0, 0],
  },
  book: {
    build(b) {
      b.add("paint", box(0.17, 0.035, 0.13), 0xc23e2e, xf([0, 0.0175, 0]));
      b.add("paint", box(0.16, 0.028, 0.135), 0xfbf3df, xf([0.008, 0.0175, 0]));
      b.add("paint", sph(0.025, 8, 6), 0xffd84a, xf([0, 0.036, 0], [0, 0, 0], [1, 0.1, 1]));
    },
    grip: { pos: [0, -0.04, 0.06], rot: [-1.2, 0, 0] },
  },
  pillow: {
    build(b) {
      const g = sph(0.2, 16, 10);
      b.add("fabric", g, 0xf6f1ff, xf([0, 0.07, 0], [0, 0, 0], [1.1, 0.35, 0.75]), {
        colorFn: (p, _n, o) => { if (Math.abs(p.x) % 0.08 < 0.02) o.setHex(0xb8d0ff); },
      });
    },
    grip: { pos: [0, -0.08, 0.12], rot: [0, 0, 0] },
  },
  bucket: {
    build(b) {
      b.add("metal", lathe([[0, 0.005], [0.095, 0.005], [0.118, 0.2], [0.112, 0.2], [0.09, 0.012], [0, 0.012]], 18), 0xa9b0b6);
      b.add("metal", new THREE.TorusGeometry(0.115, 0.006, 4, 18, Math.PI), 0x6f757a, xf([0, 0.2, 0]));
    },
    grip: { pos: [0, -0.2, 0.05], rot: [0, 0, 0] },
  },
  watering_can: {
    build(b) {
      const g = 0x3f9a4a;
      b.add("paint", cyl(0.09, 0.1, 0.16, 16), g, xf([0, 0.08, 0]));
      b.add("paint", cyl(0.012, 0.022, 0.22, 8), g, xf([0, 0.13, 0.15], [0.9, 0, 0]));
      b.add("paint", cyl(0.03, 0.02, 0.03, 10), g, xf([0, 0.21, 0.24], [0.9, 0, 0]));
      b.add("paint", new THREE.TorusGeometry(0.07, 0.012, 6, 12, Math.PI), g, xf([0, 0.16, -0.02], [0, Math.PI / 2, 0]));
    },
    grip: { pos: [0, -0.22, 0], rot: [0, 0, 0] },
  },
  flour_bag: {
    build(b) {
      const g = sph(0.13, 14, 10);
      b.add("fabric", g, 0xf1e8d2, xf([0, 0.13, 0], [0, 0, 0], [1, 1.2, 0.8]), {
        colorFn: (p, _n, o) => { if (p.z > 0.09 && Math.abs(p.y) < 0.04 && Math.abs(p.x) < 0.06) o.setHex(0x3d7fc1); },
      });
      b.add("fabric", new THREE.ConeGeometry(0.05, 0.08, 8), 0xe6dcc2, xf([0, 0.3, 0]));
      b.add("paint", new THREE.TorusGeometry(0.035, 0.008, 4, 10), 0x9a6a3e, xf([0, 0.27, 0], [Math.PI / 2, 0, 0]));
    },
    grip: { pos: [0, -0.14, 0.12], rot: [0, 0, 0] },
  },
  cake: {
    build(b) {
      b.add("paint", cyl(0.17, 0.17, 0.1, 22), 0xffb3cf, xf([0, 0.05, 0]), { colorFn: (p, _n, o) => { if (p.y < -0.03) o.setHex(0xf2d0a0); } });
      b.add("paint", cyl(0.11, 0.11, 0.08, 20), 0xfff6ee, xf([0, 0.14, 0]));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        b.add("paint", sph(0.018, 8, 6), 0xd8283a, xf([Math.cos(a) * 0.14, 0.105, Math.sin(a) * 0.14]));
      }
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2;
        b.add("paint", cyl(0.006, 0.006, 0.06, 5), [0x6b8cff, 0xffd84a, 0xff5fa2][i], xf([Math.cos(a) * 0.05, 0.21, Math.sin(a) * 0.05]));
        b.add("glass", sph(0.01, 6, 4), 0xffffff, xf([Math.cos(a) * 0.05, 0.25, Math.sin(a) * 0.05], [0, 0, 0], [1, 1.6, 1]));
      }
    },
    grip: { pos: [0, -0.06, 0.16], rot: [0, 0, 0] },
  },
  teapot: {
    build(b) {
      const blue = 0x2f63b8;
      b.add("paint", sph(0.075, 16, 12), 0xffffff, xf([0, 0.07, 0], [0, 0, 0], [1, 0.85, 1]), {
        colorFn: (p, _n, o) => { if (Math.abs(p.y) < 0.012 || (Math.abs(p.y - 0.035) < 0.008)) o.setHex(blue); else if (Math.sin(Math.atan2(p.z, p.x) * 6) > 0.85 && Math.abs(p.y) < 0.04) o.setHex(blue); },
      });
      b.add("paint", cyl(0.01, 0.02, 0.09, 8), 0xffffff, xf([0.085, 0.08, 0], [0, 0, -0.9]));
      b.add("paint", new THREE.TorusGeometry(0.035, 0.009, 6, 10, Math.PI * 1.2), 0xffffff, xf([-0.075, 0.075, 0], [0, 0, Math.PI / 2]));
      b.add("paint", sph(0.016, 8, 6), blue, xf([0, 0.14, 0]));
    },
    grip: { pos: [0, -0.07, 0.07], rot: [0, 0, 0] },
  },
};

/** Hand-placed resting spots for each prop at its home mark (the set's own layout). */

/** Rest heights the player assigns per mark (player/evaluate PROP_REST_HEIGHT); used to recognise a resting prop. */
const PLAYER_REST_Y=PROP_REST_HEIGHT;

/** If (pos) is a prop resting at a mark (as placed by the player), return that mark. Pure. */
export function restingMark(pos: Vec3): MarkId | null {
  let best: MarkId | null = null;
  let bestD = 0.6;
  for (const id of Object.keys(MARKS) as MarkId[]) {
    if(id==='house_kitchen'&&Math.abs(pos[1]-HOUSE_PREP_TABLE.height)<.05&&Math.abs(pos[0]-HOUSE_PREP_TABLE.position[0])<HOUSE_PREP_TABLE.width/2&&Math.abs(pos[2]-HOUSE_PREP_TABLE.position[1])<HOUSE_PREP_TABLE.depth/2)return id;
    const p=id==='house_kitchen'?HOUSE_PREP_TABLE.position:id==='house_living'?HOUSE_READING_TABLE.position:MARKS[id].pos;
    const d = Math.hypot(pos[0] - p[0], pos[2] - p[1]);
    if (d < bestD && Math.abs(pos[1] - (PLAYER_REST_Y[id] ?? 0.03)) < 0.05) {
      best = id;
      bestD = d;
    }
  }
  return best;
}

/** Final resting transform for a prop given the player's position. Pure. */
export function restPlacement(id: PropId, pos: Vec3): { pos: Vec3; rot: R3 } {
  const mark = restingMark(pos);
  const slot = PROP_SLOTS[id];
  const vis = PROP_VISUALS[id];
  if (mark && slot && slot.mark === mark) return { pos: [...slot.pos] as Vec3, rot: slot.rot ?? vis.restRot ?? [0, 0, 0] };
  if(mark==='house_kitchen'||mark==='house_living')return propPlacementAtMark(id,mark);
  if (mark) {
    // resting at a non-home mark: keep the player's spread, sit on the set's real surface there
    return { pos: [pos[0], restHeightAt(pos[0], pos[2]), pos[2]], rot: vis.restRot ?? [0, 0, 0] };
  }
  return { pos: [pos[0], pos[1], pos[2]], rot: pos[1] > 0.12 ? [0, 0, 0] : vis.restRot ?? [0, 0, 0] };
}

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

const SMALL_PROPS = new Set<PropId>(["jam_jar", "teapot", "lollipop", "book", "carrot", "fish", "pancakes", "honey_pot", "flowers", "frying_pan"]);

export function buildPropMesh(id: PropId, mats: LookMaterials): THREE.Mesh {
  const bag = new GeoBag();
  PROP_VISUALS[id].build(bag);
  const g = bagToSingle(bag);
  bag.dispose();
  // one mesh per prop: metal props use the metal material, others the paint material (all vertex-coloured)
  const metal = id === "frying_pan" || id === "bucket";
  const mesh = new THREE.Mesh(g, metal ? mats.metal : mats.paint);
  mesh.name = `prop:${id}`;
  // tiny props skip the shadow pass (draw-call budget); medium ones keep a contact shadow
  mesh.castShadow = !SMALL_PROPS.has(id);
  mesh.receiveShadow = true;
  return mesh;
}

const _wp = new THREE.Vector3();
const _off = new THREE.Vector3();
const _yq = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export function createProps(mats: LookMaterials): PropsHandle {
  const root = new THREE.Group();
  root.name = "props";
  const objects = {} as Record<PropId, THREE.Object3D>;
  const cache = {} as Record<PropId, { x: number; y: number; z: number; p: THREE.Vector3; r: THREE.Euler }>;
  for (const id of PROP_IDS) {
    cache[id] = { x: NaN, y: NaN, z: NaN, p: new THREE.Vector3(), r: new THREE.Euler(0, 0, 0, "YXZ") };
    const holder = new THREE.Group();
    holder.name = `prop:${id}:holder`;
    holder.rotation.order = "YXZ";
    holder.add(buildPropMesh(id, mats));
    holder.visible = false;
    root.add(holder);
    objects[id] = holder;
  }
  // A rod is rigid; its line is not. Keep the line joined to the tip while its
  // float rests on water during fishing, or hangs from the carried/resting rod.
  const rod=objects.fishing_rod;
  const line=new THREE.Mesh(cyl(.0025,.0025,1,4),new THREE.MeshBasicMaterial({color:0xe9dfc8}));
  line.name='fishing-line';
  const float=new THREE.Mesh(sph(.035,12,8),new THREE.MeshStandardMaterial({color:0xd8283a,roughness:.8}));
  float.name='fishing-float';rod.add(line,float);
  const tip=new THREE.Vector3(0,1.5,0),end=new THREE.Vector3(),direction=new THREE.Vector3();
  function updateLine(actor?:ActorFrame){
    const atPier=actor&&Math.hypot(actor.pos[0]-MARKS.pier.pos[0],actor.pos[2]-MARKS.pier.pos[1])<1.3;
    if(atPier&&(actor.verb==='fish'||actor.posture==='sit')){
      rod.updateWorldMatrix(true,false);
      end.fromArray(FISHING_WATER_TARGET);rod.worldToLocal(end);
    }else end.set(0,.62,.3);
    float.position.copy(end);
    direction.copy(end).sub(tip);line.position.copy(tip).add(end).multiplyScalar(.5);
    line.scale.y=direction.length();line.quaternion.setFromUnitVectors(_up,direction.normalize());
  }
  return {
    root,
    objects,
    apply(props, sockets, yaws, actors) {
      for (const id of PROP_IDS) {
        const o = objects[id];
        const f = props?.[id];
        if (!f || !f.visible) {
          o.visible = false;
          continue;
        }
        o.visible = true;
        const socket = f.attachedTo ? sockets[f.attachedTo] : undefined;
        if (f.attachedTo && socket) {
          if(socket.userData.preciseGrip){socket.getWorldPosition(o.position);socket.getWorldQuaternion(o.quaternion);}
          else {
            const yaw = yaws[f.attachedTo] ?? 0;
            socket.getWorldPosition(_wp);
            const g = PROP_VISUALS[id].grip;
            _yq.setFromAxisAngle(_up, yaw);
            _off.set(g.pos[0], g.pos[1], g.pos[2]).applyQuaternion(_yq);
            o.position.copy(_wp).add(_off);
            o.rotation.set(g.rot[0], yaw + g.rot[1], g.rot[2]);
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
        if(id==='fishing_rod')updateLine(f.attachedTo?actors?.[f.attachedTo]:undefined);
      }
    },
    dispose() {
      line.material.dispose();float.material.dispose();
      root.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
    },
  };
}
