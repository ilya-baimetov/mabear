import type {FrameState} from '../api';
import type {Timeline} from '../../shared/schema';
import type {BallTransform,PreparedReplayData} from './rapierReplay';

export type ReplayWorkerRequest=
  |{kind:'prepare';id:number;timeline:Timeline}
  |{kind:'pose';id:number;key:string;transform:BallTransform};
export type ReplayWorkerResponse=
  |{kind:'pose';id:number;key:string;frame:FrameState;round:number}
  |{kind:'ready';id:number;data:PreparedReplayData;wallMs:number;rounds:number}
  |{kind:'error';id:number;message:string};

/** Exact deterministic frame identity, including corrected root/contact targets. */
export const releasePoseKey=(frame:FrameState)=>JSON.stringify(frame);
