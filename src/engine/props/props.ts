// Props (spec §6.1): one charming multi-material procedural mesh per PropId (a stand-in for the production prop asset),
// placed every frame from FrameState.props — resting on the set, or attached to an actor's hand socket.
// Each prop is ONE BufferGeometry-grouped mesh named `prop:${id}`, origin at its base so it sits on surfaces.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FISHING_WATER_TARGET, MARKS } from "../../shared/bible/set";
import { PROP_IDS, type ActorId, type MarkId, type PropId, type Vec3 } from "../../shared/schema";
import type { ActorFrame, PropFrame } from "../api";
import { GeoBag, rng, xf, type LookMaterials, type MatKey } from "../look";
import { restHeightAt } from "../set/bearsYard";
import {PROP_SLOTS,PROP_REST_HEIGHT,propPlacementAtMark} from '../../shared/propPlacement';
import {PROP_CONTACTS} from '../../shared/propContacts';
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
const cyl = (rt: number, rb: number, h: number, seg = 12, hs = 1) => new THREE.CylinderGeometry(rt, rb, h, seg, hs);
const sph = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
const lathe = (pts: [number, number][], seg = 16) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);

function propLeaf(length: number, width: number, bend = 0.14): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  const p = [0, 0, 0, -width, length * 0.035, length * 0.43, 0, length * 0.1, length * 0.48, width, length * 0.035, length * 0.43, 0, length * bend, length];
  g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
  g.setIndex([0, 2, 1, 0, 3, 2, 1, 2, 4, 2, 3, 4, 1, 2, 0, 2, 3, 0, 4, 2, 1, 4, 3, 2]);
  const solid = g.toNonIndexed();
  g.dispose();
  solid.computeVertexNormals();
  return solid;
}

export const PROP_VISUALS: Record<PropId, PropVisual> = {
  pantry_honey:{
    build(b){
      b.add('glass',lathe([[0,0],[.08,0],[.105,.035],[.105,.23],[.083,.26],[.083,.28],[0,.28]],24),0xc48a36,undefined, {
        colorFn: (p, _n, o) => { if (p.y > 0.092 && p.y < 0.178 && p.z > -0.04) o.setHex(0xf2e1ae); },
      });
      b.add('metal',cyl(.091,.091,.035,24),0x40594b,xf([0,.292,0]));
      b.add('glass',sph(.025,12,8),0xb58b37,xf([.106,.14,0],[0,0,0],[.15,1,.75]));
    },grip:{pos:[0,-.13,.10],rot:[0,0,0]},
  },
  jam_jar: {
    build(b) {
      b.add("glass", lathe([[0, 0], [0.055, 0], [0.062, 0.02], [0.062, 0.1], [0.05, 0.115], [0.05, 0.125], [0, 0.125]], 20), 0xb51f3c, undefined, {
        colorFn: (p, _n, o) => { if (p.y > 0.035 && p.y < 0.075) o.setHex(0xf7ecd2); },
      });
      b.add("fabric", sph(0.068, 12, 6), 0xffffff, xf([0, 0.125, 0], [0, 0, 0], [1, 0.35, 1]), {
        colorFn: (p, _n, o) => { if ((Math.floor((p.x + 1) * 40) + Math.floor((p.z + 1) * 40)) % 2) o.setHex(0xd8283a); },
      });
      b.add("fabric", cyl(0.054, 0.054, 0.012, 16), 0xd8283a, xf([0, 0.118, 0]));
    },
    grip: { pos: [0, -0.07, 0.04], rot: [0, 0, 0] },
  },
  honey_pot: {
    build(b) {
      b.add("glass", lathe([[0, 0], [0.07, 0], [0.1, 0.05], [0.105, 0.11], [0.08, 0.17], [0.075, 0.19], [0.085, 0.2], [0, 0.2]], 20), 0xc98a3a, undefined, {
        colorFn: (p, _n, o) => { if (p.y > 0.185) o.setHex(0xf5b22a); },
      });
      b.add("glass", sph(0.03, 8, 6), 0xf5b22a, xf([0.07, 0.17, 0.02], [0, 0, 0], [0.6, 1.4, 0.6]));
      b.add("wood", cyl(0.008, 0.008, 0.2, 6), 0xc89a60, xf([0.02, 0.24, 0], [0, 0, -0.35]));
      b.add("wood", sph(0.018, 8, 6), 0xb88649, xf([0.054, 0.33, 0], [0, 0, -0.35], [1.1, 1.35, 1.1]));
    },
    grip: { pos: [0, -0.1, 0.06], rot: [0, 0, 0] },
  },
  pancakes: {
    build(b) {
      // Chamfered porcelain plate + glossy berry syrup cap/drips + melting butter pat
      b.add("glass", lathe([[0, 0], [0.105, 0], [0.148, 0.012], [0.156, 0.02], [0.148, 0.022], [0.11, 0.008], [0, 0.008]], 24), 0xfaf7ef);
      const cakeProf: [number, number][] = [[0, 0], [0.098, 0], [0.108, 0.004], [0.109, 0.011], [0.10, 0.016], [0, 0.016]];
      for (let i = 0; i < 6; i++) {
        const ox = 0.003 * ((i % 3) - 1), oz = 0.003 * ((i % 2) - 0.5);
        b.add("paint", lathe(cakeProf, 20), i % 2 ? 0xe5a44b : 0xedb45d, xf([ox, 0.009 + i * 0.0155, oz]), {
          colorFn: (p, n, o) => {
            if (Math.abs(n.y) > 0.6) o.lerp(new THREE.Color(0xc97b2c), 0.45);
            else if (Math.hypot(p.x, p.z) > 0.096) o.lerp(new THREE.Color(0xf5ca78), 0.35);
          },
        });
      }
      // Glossy berry syrup cap + sculpted rim drips
      b.add("glass", sph(0.068, 14, 8), 0xbd1f35, xf([0.006, 0.104, 0.004], [0, 0.3, 0], [1.12, 0.14, 1.05]));
      for (const [ang, len, rad] of [[0.3, 0.038, 0.012], [1.6, 0.052, 0.014], [3.1, 0.032, 0.011], [4.7, 0.044, 0.013]] as const) {
        b.add("glass", sph(rad, 8, 6), 0xb81d33, xf([Math.cos(ang) * 0.098, 0.102 - len * 0.45, Math.sin(ang) * 0.098], [0, 0, 0], [0.75, len / rad, 0.75]));
      }
      // Rounded butter pat
      b.add("glass", new RoundedBoxGeometry(0.044, 0.019, 0.044, 2, 0.006), 0xffe985, xf([-0.004, 0.117, -0.002], [0.05, 0.42, -0.04]));
    },
    grip: { pos: [0, -0.04, 0.12], rot: [0, 0, 0] },
  },
  frying_pan: {
    build(b) {
      b.add("metal", lathe([[0, 0], [0.12, 0], [0.135, 0.04], [0.128, 0.042], [0.115, 0.008], [0, 0.008]], 20), 0x2e2e30);
      b.add("wood", new RoundedBoxGeometry(0.03, 0.025, 0.2, 2, 0.007), 0x6b3f22, xf([0, 0.03, -0.22], [0.12, 0, 0]));
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
      // Sleek fusiform trout with wet sheen, dorsal/pectoral fins, and forked tail fin
      const bodyGeo = lathe([
        [0, -0.15], [0.016, -0.135], [0.044, -0.09], [0.064, -0.025],
        [0.062, 0.045], [0.040, 0.10], [0.020, 0.145], [0, 0.155],
      ], 16);
      bodyGeo.rotateZ(-Math.PI / 2);
      b.add("glass", bodyGeo, 0x8fb4cc, xf([0, 0.052, 0], [0, 0, 0], [1, 0.88, 0.46]), {
        colorFn: (p, _n, o) => {
          if (p.y > 0.018) o.setHex(0x466d85);
          else if (p.y < -0.018) o.setHex(0xe5eef3);
          else if (Math.sin(p.x * 75) * Math.cos(p.y * 95) > 0.76) o.setHex(0x3a5466);
        },
      });
      // Forked caudal tail fin (upper and lower lobes)
      for (const s of [-1, 1]) {
        b.add("glass", new THREE.ConeGeometry(0.034, 0.085, 4), 0x5c829b, xf([-0.165, 0.052 + s * 0.024, 0], [0, 0, Math.PI / 2 - s * 0.42], [1, 1, 0.22]));
      }
      // Dorsal ridge fin & pectoral fins
      b.add("glass", propLeaf(0.085, 0.026, 0.18), 0x5c829b, xf([-0.02, 0.095, 0], [-0.45, -Math.PI / 2, 0]));
      for (const s of [-1, 1]) {
        b.add("glass", propLeaf(0.048, 0.018, 0.1), 0x7ea5bd, xf([0.045, 0.038, s * 0.026], [0.2, s * 2.4, 0]));
        b.add("glass", sph(0.011, 6, 5), 0x16191c, xf([0.11, 0.064, s * 0.024]));
      }
    },
    grip: { pos: [0, -0.05, 0.08], rot: [0, Math.PI / 2, 0] },
  },
  lollipop: {
    build(b) {
      b.add("paint", cyl(0.006, 0.006, 0.16, 5), 0xffffff, xf([0, 0.08, 0]));
      b.add("glass", cyl(0.065, 0.065, 0.025, 20), 0xffffff, xf([0, 0.2, 0], [Math.PI / 2, 0, 0]), {
        colorFn: (p, _n, o) => { const a = Math.atan2(p.z, p.x); const rr = Math.hypot(p.x, p.z); o.setHex(Math.sin(a * 1 + rr * 90) > 0 ? 0xff5fa2 : 0xfff2f8); },
      });
    },
    grip: { pos: [0, -0.02, 0.02], rot: [0, 0, 0] },
    restRot: [Math.PI / 2, 0, 0],
  },
  flowers: {
    build(b) {
      // Real petaled bouquet: sculpted flower petals, pollen centers, leaves, and fabric ribbon wrap
      const heads = [0xffffff, 0xffd84a, 0xe84d42, 0x6b8cff, 0xff8fc0, 0xa070e0, 0xffffff];
      const r = rng(5);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const lean: R3 = [Math.sin(a) * 0.25, 0, -Math.cos(a) * 0.25];
        b.add("foliage", cyl(0.005, 0.006, 0.3, 4), 0x4d8a39, xf([Math.cos(a) * 0.02, 0.15, Math.sin(a) * 0.02], lean));
        const hx = Math.cos(a) * 0.02 - lean[2] * 0.15, hz = Math.sin(a) * 0.02 + lean[0] * 0.15;
        const hy = 0.3 + (i === 0 ? 0.025 : r() * 0.015);
        const petals = i % 2 === 0 ? 7 : 6;
        const pCol = heads[i];
        for (let k = 0; k < petals; k++) {
          const pa = (k / petals) * Math.PI * 2 + i * 0.5;
          b.add("foliage", sph(0.017, 6, 4), pCol, xf([hx + Math.cos(pa) * 0.02, hy, hz + Math.sin(pa) * 0.02], [0, -pa, 0.28], [1.45, 0.26, 0.72]));
        }
        b.add("foliage", sph(0.013, 6, 5), pCol === 0xffd84a ? 0xa36d2c : 0xf2bf42, xf([hx, hy + 0.005, hz], [0, 0, 0], [1, 0.65, 1]));
        if (i % 2 === 0) b.add("foliage", propLeaf(0.09, 0.028, 0.2), 0x5c9640, xf([hx * 0.5, 0.18, hz * 0.5], [-0.45, a + 0.7, 0]));
      }
      b.add("fabric", cyl(0.028, 0.028, 0.045, 10), 0xd8283a, xf([0, 0.1, 0]));
      for (const s of [-1, 1]) b.add("fabric", sph(0.018, 6, 5), 0xd8283a, xf([s * 0.025, 0.1, 0.025], [0, s * 0.5, 0], [1.3, 0.7, 0.6]));
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
      b.add("fabric", new THREE.TorusGeometry(0.035, 0.008, 4, 10), 0x9a6a3e, xf([0, 0.27, 0], [Math.PI / 2, 0, 0]));
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
        b.add("glass", sph(0.011, 6, 4), 0xffe8a0, xf([Math.cos(a) * 0.05, 0.25, Math.sin(a) * 0.05], [0, 0, 0], [1, 1.75, 1]));
      }
    },
    grip: { pos: [0, -0.06, 0.16], rot: [0, 0, 0] },
  },
  teapot: {
    build(b) {
      const blue = 0x2f63b8;
      b.add("glass", sph(0.075, 16, 12), 0xffffff, xf([0, 0.07, 0], [0, 0, 0], [1, 0.85, 1]), {
        colorFn: (p, _n, o) => { if (Math.abs(p.y) < 0.012 || (Math.abs(p.y - 0.035) < 0.008)) o.setHex(blue); else if (Math.sin(Math.atan2(p.z, p.x) * 6) > 0.85 && Math.abs(p.y) < 0.04) o.setHex(blue); },
      });
      b.add("glass", cyl(0.01, 0.02, 0.09, 8), 0xffffff, xf([0.085, 0.08, 0], [0, 0, -0.9]));
      b.add("glass", new THREE.TorusGeometry(0.035, 0.009, 6, 10, Math.PI * 1.2), 0xffffff, xf([-0.075, 0.075, 0], [0, 0, Math.PI / 2]));
      b.add("glass", sph(0.016, 8, 6), blue, xf([0, 0.14, 0]));
    },
    grip: { pos: [0, -0.07, 0.07], rot: [0, 0, 0] },
  },
};

/** Hand-placed resting spots for each prop at its home mark (the set's own layout). */

/** Rest heights the player assigns per mark (player/evaluate PROP_REST_HEIGHT); used to recognise a resting prop. */
const PLAYER_REST_Y=PROP_REST_HEIGHT;

/** If (pos) is a prop resting at a mark (as placed by the player), return that mark. Pure. */
export function restingMark(pos: Vec3): MarkId | null {
  const cupboard=PROP_SLOTS.pantry_honey!;
  if(Math.hypot(pos[0]-cupboard.pos[0],pos[1]-cupboard.pos[1],pos[2]-cupboard.pos[2])<.01)return 'cupboard';
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

const SMALL_PROPS = new Set<PropId>(["carrot", "flowers", "fish", "lollipop", "book"]);

interface PropPalette {
  ceramic: THREE.MeshStandardMaterial;
  matteFood: THREE.MeshStandardMaterial;
  flower: THREE.MeshStandardMaterial;
  flame: THREE.MeshStandardMaterial;
  owned: THREE.Material[];
}

function createPropPalette(mats: LookMaterials): PropPalette {
  const ceramic = mats.paint.clone();
  ceramic.name = "prop:ceramic";
  ceramic.roughness = 0.2;
  ceramic.metalness = 0.04;
  ceramic.envMapIntensity = 1.35;

  const matteFood = mats.paint.clone();
  matteFood.name = "prop:food";
  matteFood.roughness = 0.78;
  matteFood.metalness = 0.0;

  const flower = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.68, metalness: 0.0 });
  flower.name = "prop:flower";

  const flame = new THREE.MeshStandardMaterial({
    vertexColors: true,
    color: 0xffe49e,
    emissive: 0xff9a28,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  flame.name = "prop:flame";

  return { ceramic, matteFood, flower, flame, owned: [ceramic, matteFood, flower, flame] };
}

function resolvePropMaterial(id: PropId, key: MatKey, mats: LookMaterials, pal: PropPalette): THREE.Material {
  if (key === "glass") return id === "cake" ? pal.flame : pal.ceramic;
  if (key === "paint" && id === "pancakes") return pal.matteFood;
  if (key === "foliage") return pal.flower;
  return mats[key];
}

export function buildPropMesh(id: PropId, mats: LookMaterials, palette?: PropPalette): THREE.Mesh {
  const pal = palette ?? createPropPalette(mats);
  const bag = new GeoBag();
  PROP_VISUALS[id].build(bag);
  const merged = bag.merged();
  bag.dispose();

  // Coalesce parts that resolve to the same material instance so groups match minimal draw calls.
  const buckets = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const [key, g] of merged) {
    const m = resolvePropMaterial(id, key, mats, pal);
    const list = buckets.get(m) ?? [];
    list.push(g);
    buckets.set(m, list);
  }

  const groupGeos: THREE.BufferGeometry[] = [];
  const groupMats: THREE.Material[] = [];
  for (const [m, list] of buckets) {
    if (list.length === 1) {
      groupGeos.push(list[0]);
    } else {
      groupGeos.push(mergeGeometries(list, false)!);
      for (const item of list) item.dispose();
    }
    groupMats.push(m);
  }

  let geometry: THREE.BufferGeometry;
  let material: THREE.Material | THREE.Material[];
  if (groupGeos.length === 1) {
    geometry = groupGeos[0];
    material = groupMats[0];
  } else {
    geometry = mergeGeometries(groupGeos, true)!;
    for (const part of groupGeos) part.dispose();
    material = groupMats;
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `prop:${id}`;
  // tiny props skip the shadow pass (draw-call budget); hero tabletop & medium props keep contact shadows
  mesh.castShadow = !SMALL_PROPS.has(id);
  mesh.receiveShadow = true;
  if (!palette) {
    const used = new Set(groupMats);
    for (const m of pal.owned) if (!used.has(m)) m.dispose();
    mesh.userData.propOwnedMaterials = pal.owned.filter((m) => used.has(m));
  }
  return mesh;
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
const _tipWorld = new THREE.Vector3();
const _baseWorld = new THREE.Vector3();
const _hangWorld = new THREE.Vector3();
const _launchWorld = new THREE.Vector3();
const _waterTarget = new THREE.Vector3();
const _reelStartWorld = new THREE.Vector3();
const _endWorld = new THREE.Vector3();
const _floatWorld = new THREE.Vector3();
const _invLineMat = new THREE.Matrix4();

const PENDULUM_PROPS = new Set<PropId>(["bucket", "watering_can", "flowers"]);
const smooth01 = (v: number) => {
  const k = Math.max(0, Math.min(1, v));
  return k * k * (3 - 2 * k);
};

function buildCookingPancake(matteFood: THREE.Material): THREE.Mesh {
  const bag = new GeoBag();
  const colorFn = (p: THREE.Vector3, n: THREE.Vector3, o: THREE.Color) => {
    const r = Math.hypot(p.x, p.z);
    if (Math.abs(n.y) > 0.65 && r < 0.078) o.lerp(new THREE.Color(0xc46e22), 0.55);
    else if (r > 0.084) o.lerp(new THREE.Color(0xf4cb78), 0.45);
  };
  const baseProf: [number, number][] = [
    [0, -0.007], [0.086, -0.007], [0.094, -0.003], [0.095, 0.002], [0.088, 0.006], [0, 0.006],
  ];
  bag.add("paint", lathe(baseProf, 20), 0xe6a147, undefined, { colorFn });
  const topLayer: [number, number][] = [
    [0, 0.004], [0.070, 0.004], [0.076, 0.0065], [0.070, 0.009], [0, 0.009],
  ];
  bag.add("paint", lathe(topLayer, 20), 0xedb359, undefined, { colorFn });
  const geo = bag.merged().get("paint")!;
  bag.dispose();
  const mesh = new THREE.Mesh(geo, matteFood);
  mesh.name = "pan:cooking-pancake";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.visible = false;
  mesh.position.set(0, 0.015, 0);
  return mesh;
}

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
  const cookingPancake = buildCookingPancake(palette.matteFood);
  panMesh.add(cookingPancake);

  // A rod is rigid; its line is not. Keep the line joined to the tip while its
  // float rests on water during fishing, arcs during cast/reel, or drapes under gravity.
  const rod = objects.fishing_rod;
  const lineSagUniform = { value: new THREE.Vector3() };
  const lineMat = new THREE.MeshBasicMaterial({ color: 0xe9dfc8 });
  lineMat.onBeforeCompile = (sh) => {
    sh.uniforms.uSagVec = lineSagUniform;
    if (sh.vertexShader.includes("#include <common>") && sh.vertexShader.includes("#include <begin_vertex>")) {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uSagVec;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
  float pin = abs(position.y) >= 0.499 ? 0.0 : 1.0;
  float uLine = clamp(position.y + 0.5, 0.0, 1.0);
  float cat = 4.0 * uLine * (1.0 - uLine) * pin;
  transformed += uSagVec * cat;
}`,
        );
    }
  };
  lineMat.customProgramCacheKey = () => "prop:fishing-line-catenary-v1";
  const line = new THREE.Mesh(cyl(0.0025, 0.0025, 1, 6, 16), lineMat);
  line.name = "fishing-line";
  line.userData.sagUniform = lineSagUniform;
  const float = new THREE.Mesh(sph(0.035, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8283a, roughness: 0.8 }));
  float.name = "fishing-float";
  rod.add(line, float);

  const tip = new THREE.Vector3(0, 1.5, 0);
  const end = new THREE.Vector3();
  const direction = new THREE.Vector3();

  function bobberOnWaterAt(time: number, uVal: number, out: THREE.Vector3): { pulse: number; bite: number } {
    const w = THREE.MathUtils.clamp((uVal - 0.30) / 0.32, 0, 1);
    const impact = -0.025 * Math.exp(-w * 18) * Math.sin(w * 24);
    const ambient = 0.007 * Math.sin(time * 2.8) * Math.min(1, w * 8);
    let bite = 0;
    for (const [center, depth] of [[0.30, 0.042], [0.62, 0.052], [0.88, 0.068]] as const) {
      const d = (w - center) / 0.055;
      bite += depth * Math.exp(-d * d);
    }
    const jitter = bite > 0.005 ? Math.sin(time * 22) * 0.008 * Math.min(1, bite * 20) : 0;
    const ramp = Math.min(1, w * 6);
    const bobY = Math.max(0.016, FISHING_WATER_TARGET[1] + impact + ambient - bite * 0.45 + jitter);
    out.set(
      FISHING_WATER_TARGET[0] + 0.012 * Math.sin(time * 1.1) * ramp,
      bobY,
      FISHING_WATER_TARGET[2] + 0.010 * Math.cos(time * 0.9) * ramp,
    );
    const splashPulse = Math.exp(-w * 10) * 0.9;
    const bitePulse = Math.min(1, bite / 0.055);
    const idleRipple = 0.18 + 0.08 * (0.5 + 0.5 * Math.sin(time * 2.8));
    return { pulse: THREE.MathUtils.clamp(Math.max(idleRipple, splashPulse, bitePulse), 0, 1), bite };
  }

  function updateLine(actor: ActorFrame | undefined, attached: boolean) {
    rod.updateWorldMatrix(true, false);
    const atPier = !!(actor && Math.hypot(actor.pos[0] - MARKS.pier.pos[0], actor.pos[2] - MARKS.pier.pos[1]) < 1.3);
    const hasAction = !!(actor && actor.action);
    let sagMeters = 0;
    let bobberPulse = 0;

    if (!attached) {
      // Resting unattached: check if horizontal on pier/surface and drape gently under gravity along -Y
      _baseWorld.set(0, 0, 0).applyMatrix4(rod.matrixWorld);
      _tipWorld.copy(tip).applyMatrix4(rod.matrixWorld);
      const horizontal = Math.abs(_tipWorld.y - _baseWorld.y) < 0.25;
      if (horizontal) {
        end.set(0.08, 0.62, -0.025);
        sagMeters = 0.032;
      } else {
        end.set(0, 0.62, 0.3);
      }
    } else if (!hasAction) {
      // Strict restFrame invariant (< 1e-10 chord & 0 sag when !actor.action)
      if (atPier && (actor!.verb === "fish" || actor!.posture === "sit")) {
        end.fromArray(FISHING_WATER_TARGET);
        rod.worldToLocal(end);
      } else {
        end.set(0, 0.62, 0.3);
      }
      sagMeters = 0;
    } else if (atPier && actor!.verb === "fish" && actor!.action!.duration > 0) {
      const dur = actor!.action!.duration;
      const t = Math.max(0, actor!.action!.time);
      const u = THREE.MathUtils.clamp(t / dur, 0, 1);
      _hangWorld.set(0, 0.62, 0.3).applyMatrix4(rod.matrixWorld);
      _tipWorld.copy(tip).applyMatrix4(rod.matrixWorld);
      _waterTarget.set(FISHING_WATER_TARGET[0], FISHING_WATER_TARGET[1], FISHING_WATER_TARGET[2]);
      if (u < 0.08) {
        const w0 = smooth01(u / 0.08);
        _endWorld.copy(_hangWorld).lerp(_tipWorld, 0.12 * w0);
        _endWorld.y -= 0.06 * (1 - w0);
        sagMeters = 0.05;
      } else if (u < 0.30) {
        _launchWorld.copy(_hangWorld).lerp(_tipWorld, 0.12);
        const s = (u - 0.08) / 0.22;
        _endWorld.copy(_launchWorld).lerp(_waterTarget, s);
        _endWorld.y += 1.15 * 4 * s * (1 - s);
        sagMeters = 0.05 + 0.06 * Math.sin(Math.PI * s);
      } else if (u < 0.62) {
        const res = bobberOnWaterAt(t, u, _endWorld);
        bobberPulse = res.pulse;
        sagMeters = THREE.MathUtils.lerp(0.16, 0.035, Math.min(1, res.bite / 0.05));
      } else if (u < 0.70) {
        bobberOnWaterAt(0.62 * dur, 0.62, _reelStartWorld);
        const s = smooth01((u - 0.62) / 0.08);
        _endWorld.copy(_reelStartWorld).lerp(_hangWorld, s);
        _endWorld.y += 0.16 * 4 * s * (1 - s);
        bobberPulse = (1 - smooth01((u - 0.62) / 0.025)) * 0.35;
        sagMeters = (1 - s) * 0.02;
      } else {
        _endWorld.copy(_hangWorld);
        sagMeters = 0.03;
      }
      end.copy(_endWorld);
      rod.worldToLocal(end);
    } else if (atPier && (actor!.verb === "fish" || actor!.posture === "sit")) {
      end.fromArray(FISHING_WATER_TARGET);
      rod.worldToLocal(end);
      sagMeters = actor!.action!.duration > 0 ? 0.14 : 0;
    } else {
      end.set(0, 0.62, 0.3);
      sagMeters = actor!.action!.duration > 0 ? 0.045 : 0;
    }

    float.position.copy(end);
    direction.copy(end).sub(tip);
    const len = direction.length();
    line.position.copy(tip).add(end).multiplyScalar(0.5);
    line.scale.y = len;
    if (len > 1e-6) line.quaternion.setFromUnitVectors(_up, direction.normalize());
    else line.quaternion.identity();

    if (sagMeters > 0 && len > 1e-4) {
      line.updateWorldMatrix(true, false);
      _invLineMat.copy(line.matrixWorld).invert();
      _invLineMat.elements[12] = 0;
      _invLineMat.elements[13] = 0;
      _invLineMat.elements[14] = 0;
      lineSagUniform.value.set(0, -sagMeters, 0).applyMatrix4(_invLineMat);
    } else {
      lineSagUniform.value.set(0, 0, 0);
    }

    _floatWorld.copy(float.position).applyMatrix4(rod.matrixWorld);
    rod.userData.bobberWorld = [_floatWorld.x, _floatWorld.y, _floatWorld.z] as Vec3;
    rod.userData.bobberPulse = bobberPulse;
    rod.userData.lineSag = sagMeters;
  }

  function updateCookingPancake(actor?: ActorFrame) {
    const active = !!(actor && actor.verb === "cook" && actor.action && actor.posture !== "offstage" && actor.opacity > 0);
    cookingPancake.visible = active;
    if (!active) {
      cookingPancake.position.set(0, 0.015, 0);
      cookingPancake.rotation.set(0, 0, 0);
      return;
    }
    const lt = Math.max(0, actor.action!.time);
    const cycle = Math.floor(lt / 1.6);
    const flipT = (lt % 1.6) / 1.6;
    const start = 0.55;
    const endT = 0.95;
    if (flipT >= start && flipT <= endT) {
      const s = (flipT - start) / (endT - start);
      const height = 0.32;
      cookingPancake.position.set(0, 0.015 + 4 * height * s * (1 - s), 0);
      cookingPancake.rotation.set((cycle + s) * Math.PI, 0, 0);
    } else {
      const flipsDone = flipT > endT ? cycle + 1 : cycle;
      cookingPancake.position.set(0, 0.015, 0);
      cookingPancake.rotation.set(flipsDone * Math.PI, 0, 0);
    }
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
          if (id === "frying_pan") cookingPancake.visible = false;
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
        if (id === "fishing_rod") updateLine(actor, Boolean(f.attachedTo));
        if (id === "frying_pan") updateCookingPancake(actor);
      }
    },
    dispose() {
      line.material.dispose();float.material.dispose();
      for (const m of palette.owned) m.dispose();
      root.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
    },
  };
}
