import type {ActorId,Vec3} from './schema';
/** Neutral shipped-rig shoulder and combined arm length, in metres. Measured
 * once from the actual generated/procedural rigs, independent of asset timing. */
export const CHARACTER_REACH:Record<ActorId,{shoulder:Vec3;length:number}>={
 masha:{shoulder:[-.0874,.5718,.0321],length:.1980},bear:{shoulder:[-.3589,1.7299,-.0008],length:.8122},
 lady_bear:{shoulder:[-.2483,1.5667,.0834],length:.6943},hare:{shoulder:[-.0461,.3776,-.0075],length:.1622},
 rosie:{shoulder:[-.1689,.6646,.0594],length:.2465},squirrel:{shoulder:[-.0122,.3281,-.0063],length:.1472},
 rival_bear:{shoulder:[-.4726,1.8476,-.0330],length:.9151},wolf_a:{shoulder:[-.2583,1.3327,.0482],length:.5740},wolf_b:{shoulder:[-.2387,1.2525,.0536],length:.5404},
};
