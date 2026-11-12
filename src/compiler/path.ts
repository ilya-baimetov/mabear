// Waypoint-graph locomotion routing (spec §7.2). Pure and deterministic.
// Straight line when clear; otherwise the shortest path via the WAYPOINTS graph around OBSTACLES.
// An obstacle that contains an endpoint of a segment is ignored for that segment, so marks that sit
// inside an obstacle footprint (pier over the pond, table, hiding spots) stay reachable.
import { isInsideHouse, OBSTACLES, SET_BOUNDS, WAYPOINTS, sceneLocationAt } from "../shared/bible/set";
import type { Vec2 } from "../shared/schema";
import {pondBlocksWalk,pondRadius,POND_CENTER,POND_PIER_START} from '../shared/pond';
import {HOUSE_FOOTPRINT,HOUSE_COOKING_HELPER,HOUSE_PREP_TABLE,HOUSE_READING_TABLE,HOUSE_LIVING_MARK,houseLocal,houseWorld} from '../shared/houseLayout';

const MARGIN = 0.25;

function insideCircle(p: Vec2, c: Vec2, r: number): boolean {
  return Math.hypot(p[0] - c[0], p[1] - c[1]) < r;
}
function insideBox(p: Vec2, min: Vec2, max: Vec2, m = 0): boolean {
  return p[0] > min[0] - m && p[0] < max[0] + m && p[1] > min[1] - m && p[1] < max[1] + m;
}

/** Distance from point p to segment ab. */
function distPointSeg(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dz));
}

function segIntersectsBox(a: Vec2, b: Vec2, min: Vec2, max: Vec2): boolean {
  // sample-based test (boxes are large relative to the step), plus endpoints
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p: Vec2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    if (insideBox(p, min, max, MARGIN)) return true;
  }
  return false;
}

/** Furniture is navigated on the house stage, never against the hidden yard's
 * bounding boxes. Coordinates below are the revised model's local footprints. */
export function interiorObstacles():{id:string;min:Vec2;max:Vec2}[]{
  const rect=(id:string,min:Vec2,max:Vec2)=>({id,min:houseWorld(min),max:houseWorld(max)});
  const table=(id:string,position:Vec2,width:number,depth:number)=>({id,min:[position[0]-width/2,position[1]-depth/2] as Vec2,max:[position[0]+width/2,position[1]+depth/2] as Vec2});
  const helper=HOUSE_COOKING_HELPER;
  return [
    table('preparation-table',HOUSE_PREP_TABLE.position,HOUSE_PREP_TABLE.width,HOUSE_PREP_TABLE.depth),
    table('reading-table',HOUSE_READING_TABLE.position,HOUSE_READING_TABLE.width,HOUSE_READING_TABLE.depth),
    rect('reading-chair',[-.15,-1.95],[1.45,-.66]),
    rect('chair-tray',[1.49,-1.65],[1.97,-.88]),
    rect('fireplace',[-1.79,-2.80],[-.35,-1.30]),
    rect('bookcase',[.325,-2.755],[2.875,-1.975]),
    rect('pantry',[-7.65,.22],[-6.86,2.28]),
    rect('refrigerator',[-7.60,-1.0],[-6.08,.60]),
    rect('kitchen-counter',[-6.52,-2.09],[-3.90,-.78]),
    rect('stove',[-4.60,-.67],[-3.76,.17]),
    rect('kitchen-left-chair',[-6.10,.20],[-5.40,.94]),
    rect('kitchen-south-chair',[-5.40,2.47],[-4.70,3.22]),
    {id:'cooking-helper',min:[helper.position[0]-.35,helper.position[1]-helper.depth/2],max:[helper.position[0]+.35+helper.stepDepth*2,helper.position[1]+helper.depth/2]},
  ];
}

const HOUSE_MARGIN=.30;
function houseFloorClear(p:Vec2):boolean {
  if(!isInsideHouse(...p))return false;
  const local=houseLocal(p);
  return HOUSE_FOOTPRINT.every((a,i)=>distPointSeg(local,a,HOUSE_FOOTPRINT[(i+1)%HOUSE_FOOTPRINT.length])>.13);
}
/** A seat/helper may be an endpoint inside its own footprint; other furniture
 * remains solid. Every intermediate sample must stay within the real floor. */
export function interiorSegmentClear(a:Vec2,b:Vec2):boolean {
  const count=Math.max(2,Math.ceil(d(a,b)/.12));
  for(let i=0;i<=count;i++)if(!houseFloorClear([a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count]))return false;
  for(const box of interiorObstacles()){
    const permittedEndpoint=box.id==='reading-chair'||box.id==='cooking-helper';
    if(permittedEndpoint&&(insideBox(a,box.min,box.max)||insideBox(b,box.min,box.max)))continue;
    // A compiler approach may end just outside a contact surface. Allow its
    // immediate approach, while preventing the rest of the route cutting it.
    const endpointMargin=insideBox(a,box.min,box.max,HOUSE_MARGIN)||insideBox(b,box.min,box.max,HOUSE_MARGIN);
    for(let i=1;i<count;i++){
      const p:Vec2=[a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count];
      if(insideBox(p,box.min,box.max,endpointMargin?0:HOUSE_MARGIN))return false;
    }
  }
  return true;
}

function planInteriorPath(a:Vec2,b:Vec2):Vec2[]{
  if(d(a,b)<1e-6||interiorSegmentClear(a,b))return [a,b];
  const nodes:Vec2[]=[a,b];
  const candidates:Vec2[]=[[-6.45,3.15],[-3.0,3.15],[-1.5,2.7],[1.5,1.5],[2.5,.4],[1.5,-.35],[-2.35,.45],[-5.9,-.3]].map(houseWorld);
  for(const box of interiorObstacles())for(const x of [box.min[0]-HOUSE_MARGIN-.08,box.max[0]+HOUSE_MARGIN+.08])for(const z of [box.min[1]-HOUSE_MARGIN-.08,box.max[1]+HOUSE_MARGIN+.08])candidates.push([x,z]);
  nodes.push(...candidates.filter(p=>houseFloorClear(p)&&interiorObstacles().every(box=>!insideBox(p,box.min,box.max,HOUSE_MARGIN-.01))));
  const costs=nodes.map(()=>Infinity),previous=nodes.map(()=>-1),done=nodes.map(()=>false);costs[0]=0;
  for(;;){
    let u=-1;for(let i=0;i<nodes.length;i++)if(!done[i]&&costs[i]<Infinity&&(u<0||costs[i]<costs[u]))u=i;
    if(u<0||u===1)break;done[u]=true;
    for(let v=0;v<nodes.length;v++)if(!done[v]&&interiorSegmentClear(nodes[u],nodes[v])){
      const cost=costs[u]+d(nodes[u],nodes[v]);if(cost<costs[v]){costs[v]=cost;previous[v]=u;}
    }
  }
  if(previous[1]<0)return [a,a];
  const route:Vec2[]=[];for(let i=1;i>=0;i=previous[i])route.unshift(nodes[i]);
  return smooth(route,interiorSegmentClear);
}

/** True when the straight segment a→b avoids every obstacle (except those containing a or b). */
export function segmentClear(a: Vec2, b: Vec2): boolean {
  const waterSteps=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.1));
  for(let i=0;i<=waterSteps;i++){
    const t=i/waterSteps;
    if(pondBlocksWalk(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t))return false;
  }
  for (const c of OBSTACLES.circles) {
    if(c.id==='pond')continue; // the exact irregular shoreline and legal pier above replace the old circle
    if (insideCircle(a, c.c, c.r + MARGIN) || insideCircle(b, c.c, c.r + MARGIN)) continue;
    if (distPointSeg(c.c, a, b) < c.r + MARGIN) return false;
  }
  for (const bx of OBSTACLES.boxes) {
    if (insideBox(a, bx.min, bx.max, MARGIN) || insideBox(b, bx.min, bx.max, MARGIN)) continue;
    if (segIntersectsBox(a, b, bx.min, bx.max)) return false;
  }
  return true;
}

function d(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

/** Route from → to: straight line if clear, else the shortest path via the waypoint graph. Includes from and to. */
export function planPath(from: Vec2, to: Vec2): Vec2[] {
  const a: Vec2 = [from[0], from[1]];
  const b: Vec2 = [to[0], to[1]];
  const fromInside=isInsideHouse(...a),toInside=isInsideHouse(...b);
  // The house is a separately staged set. The compiler makes a short scene cut
  // at its boundary; no invisible journey through the yard joins these points.
  if(fromInside!==toInside)return [a,b];
  if(fromInside&&toInside)return planInteriorPath(a,b);
  // Separate sets share saved world coordinates. A local yard shortcut must
  // not cross a different set, or scene filtering hides the walking actor.
  // Deliberate travel between locations keeps its existing handoff route.
  const localYard = sceneLocationAt(...a) === 'yard' && sceneLocationAt(...b) === 'yard';
  const routeClear = (p: Vec2, q: Vec2): boolean => {
    if (!segmentClear(p, q)) return false;
    if (!localYard) return true;
    const steps = Math.max(1, Math.ceil(d(p, q) / .1));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (sceneLocationAt(p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t) !== 'yard') return false;
    }
    return true;
  };
  if (d(a, b) < 1e-6) return [a, b];
  if (routeClear(a, b)) return [a, b];

  // Graph: 0 = from, 1 = to, 2.. = waypoints
  const nodes: Vec2[] = [a, b, ...WAYPOINTS.map((w) => w.pos),[...POND_PIER_START]];
  const idx = new Map(WAYPOINTS.map((w, i) => [w.id, i + 2]));
  const adj: number[][] = nodes.map(() => []);
  const link = (i: number, j: number) => {
    if (!adj[i].includes(j)) adj[i].push(j);
    if (!adj[j].includes(i)) adj[j].push(i);
  };
  WAYPOINTS.forEach((w, i) => w.links.forEach((l) => { const j = idx.get(l); if (j !== undefined && routeClear(nodes[i + 2], nodes[j])) link(i + 2, j); }));
  const pierNode=nodes.length-1;
  for(let i=2;i<pierNode;i++)if(routeClear(nodes[i],nodes[pierNode]))link(i,pierNode);
  for (let i = 2; i < nodes.length; i++) {
    if (routeClear(a, nodes[i])) link(0, i);
    if (routeClear(nodes[i], b)) link(1, i);
  }

  // Dijkstra (tiny graph)
  const dist = nodes.map(() => Infinity);
  const prev = nodes.map(() => -1);
  const done = nodes.map(() => false);
  dist[0] = 0;
  for (;;) {
    let u = -1;
    for (let i = 0; i < nodes.length; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0 || u === 1) break;
    done[u] = true;
    for (const v of adj[u]) {
      const nd = dist[u] + d(nodes[u], nodes[v]);
      if (nd < dist[v] - 1e-9) { dist[v] = nd; prev[v] = u; }
    }
  }
  // No safe route: hold position rather than walk through scenery.
  if (prev[1] < 0) return [a, a];
  const chain: number[] = [];
  for (let v = 1; v >= 0; v = prev[v]) chain.unshift(v);
  const path = chain.map((i) => [nodes[i][0], nodes[i][1]] as Vec2);
  return smooth(path, routeClear);
}

/** Drop intermediate waypoints that can be skipped with a clear straight segment (string pulling). */
function smooth(path: Vec2[], clear: (a: Vec2, b: Vec2) => boolean): Vec2[] {
  const out: Vec2[] = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let j = path.length - 1;
    while (j > i + 1 && !clear(path[i], path[j])) j--;
    out.push(path[j]);
    i = j;
  }
  return out;
}

export function pathLength(path: Vec2[]): number {
  let len = 0;
  for (let i = 1; i < path.length; i++) len += d(path[i], path[i - 1]);
  return len;
}

/** Point at arc-length distance s along the path (clamped to its ends). */
export function pointAlong(path: Vec2[], s: number): Vec2 {
  if (path.length === 0) return [0, 0];
  if (s <= 0) return [path[0][0], path[0][1]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = d(path[i], path[i - 1]);
    if (acc + seg >= s && seg > 0) {
      const t = (s - acc) / seg;
      return [path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t];
    }
    acc += seg;
  }
  const last = path[path.length - 1];
  return [last[0], last[1]];
}

/** Yaw (0 = +z) of the direction a→b; `fallback` when the points coincide. */
export function yawTo(a: Vec2, b: Vec2, fallback = 0): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  if (Math.abs(dx) < 1e-6 && Math.abs(dz) < 1e-6) return fallback;
  return Math.atan2(dx, dz);
}

/** Yaw of the path's last leg. */
export function pathEndYaw(path: Vec2[], fallback = 0): number {
  for (let i = path.length - 1; i > 0; i--) {
    if (d(path[i], path[i - 1]) > 1e-4) return yawTo(path[i - 1], path[i], fallback);
  }
  return fallback;
}

/** Clamp a point into the walkable set bounds (with a margin) and push it out of obstacle footprints. */
export function clampWalkable(p: Vec2, margin = 1.5): Vec2 {
  if(isInsideHouse(...p)){
    const boxes=interiorObstacles();
    let q:Vec2=[...p];
    // Preserve the authored seat/helper endpoints; movement to them uses the
    // dedicated mount/seat approach rather than pushing actors off the support.
    if(d(q,HOUSE_LIVING_MARK)<.16||insideBox(q,boxes[boxes.length-1].min,boxes[boxes.length-1].max))return q;
    for(let pass=0;pass<3;pass++)for(const box of boxes){
      if(!insideBox(q,box.min,box.max,.22))continue;
      const options:Vec2[]=[[box.min[0]-.24,q[1]],[box.max[0]+.24,q[1]],[q[0],box.min[1]-.24],[q[0],box.max[1]+.24]];
      const safe=options.filter(houseFloorClear).sort((a,b)=>d(a,q)-d(b,q));
      if(safe.length)q=safe[0];
    }
    return q;
  }
  let x = Math.max(SET_BOUNDS.minX + margin, Math.min(SET_BOUNDS.maxX - margin, p[0]));
  let z = Math.max(SET_BOUNDS.minZ + margin, Math.min(SET_BOUNDS.maxZ - margin, p[1]));
  if(pondBlocksWalk(x,z)){
    const a=Math.atan2(z-POND_CENTER[1],x-POND_CENTER[0]),r=pondRadius(a)+.3;
    x=POND_CENTER[0]+Math.cos(a)*r;z=POND_CENTER[1]+Math.sin(a)*r;
  }
  for (const c of OBSTACLES.circles) {
    if(c.id==='pond')continue;
    const dd = Math.hypot(x - c.c[0], z - c.c[1]);
    if (dd < c.r + 0.3) {
      const k = dd < 1e-6 ? 1 : (c.r + 0.3) / dd;
      x = c.c[0] + (dd < 1e-6 ? c.r + 0.3 : (x - c.c[0]) * k);
      z = c.c[1] + (dd < 1e-6 ? 0 : (z - c.c[1]) * k);
    }
  }
  for (const bx of OBSTACLES.boxes) {
    if(bx.id==='house'&&isInsideHouse(p[0],p[1]))continue;
    if (insideBox([x, z], bx.min, bx.max, 0.3)) {
      const opts: [number, number, number][] = [
        [Math.abs(x - (bx.min[0] - 0.3)), bx.min[0] - 0.3, z],
        [Math.abs(x - (bx.max[0] + 0.3)), bx.max[0] + 0.3, z],
        [Math.abs(z - (bx.min[1] - 0.3)), x, bx.min[1] - 0.3],
        [Math.abs(z - (bx.max[1] + 0.3)), x, bx.max[1] + 0.3],
      ];
      opts.sort((p1, p2) => p1[0] - p2[0]);
      x = opts[0][1];
      z = opts[0][2];
    }
  }
  return [x, z];
}
