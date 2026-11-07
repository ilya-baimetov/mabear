import {describe,it,expect} from 'vitest';
import {pondBlocksWalk,pondRadius,pondWaterAt} from '../../src/shared/pond';
import {clampWalkable,pathLength,planPath,pointAlong,segmentClear} from '../../src/compiler/path';
import {MARKS,sceneLocationAt,surfaceAt,FISHING_WATER_TARGET} from '../../src/shared/bible/set';

describe('rendered woodland pond navigation',()=>{
 it('keeps semantic shore dry, the pier walkable, and the fishing target in water',()=>{
  expect(pondWaterAt(...MARKS.pond_shore.pos)).toBe(false);
  expect(pondWaterAt(...MARKS.pier.pos)).toBe(true);
  expect(pondBlocksWalk(...MARKS.pier.pos)).toBe(false);
  expect(surfaceAt(...MARKS.pier.pos)).toBe('wood');
  expect(pondBlocksWalk(FISHING_WATER_TARGET[0],FISHING_WATER_TARGET[2])).toBe(true);
 });
 it('routes in both directions between the shore and pier without wading through the new shoreline',()=>{
  for(const [from,to]of [[MARKS.pond_shore.pos,MARKS.pier.pos],[MARKS.pier.pos,MARKS.pond_shore.pos]]){
   const path=planPath(from,to),length=pathLength(path);
   expect(path.at(-1)).toEqual(to);
   for(let i=0;i<=100;i++)expect(pondBlocksWalk(...pointAlong(path,length*i/100))).toBe(false);
  }
 });
 it('rejects walking across expanded far-bank water and clamps free destinations onto dry land',()=>{
  const theta=-Math.PI*.78,inside:[number,number]=[-8+Math.cos(theta)*(pondRadius(theta)-.6),10+Math.sin(theta)*(pondRadius(theta)-.6)];
  expect(Math.hypot(inside[0]+8,inside[1]-10)).toBeGreaterThan(3.5);
  expect(pondWaterAt(...inside)).toBe(true);
  expect(sceneLocationAt(...inside)).toBe('pond');
  expect(surfaceAt(...inside)).toBe('water');
  expect(segmentClear([-16,4],inside)).toBe(false);
  expect(pondBlocksWalk(...clampWalkable(inside))).toBe(false);
 });
});
