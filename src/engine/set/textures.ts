// CC0 PBR detail textures for the set (A5; sources and licenses in docs/ASSETS.md). Loaded asynchronously AFTER the
// stage first renders; every texture is optional — a file that fails to load leaves the procedural look in place.
// Colour maps are "detail" maps: the original CC0 albedo normalised offline to a neutral mean (sRGB ≈ 0.85), so the
// set's baked vertex colours keep the series palette and the photo texture only adds grain, fibre and relief.
import * as THREE from "three";

export const ENV_TEXTURE_FILES = {
  grass: "grass_detail.jpg",
  grassN: "grass_normal.jpg",
  dirt: "dirt_detail.jpg",
  dirtN: "dirt_normal.jpg",
  wood: "wood_detail.jpg",
  woodN: "wood_normal.jpg",
  bark: "bark_detail.jpg",
  barkN: "bark_normal.jpg",
} as const;
export type EnvTextureKey = keyof typeof ENV_TEXTURE_FILES;
export type EnvTextures = Partial<Record<EnvTextureKey, THREE.Texture>>;

/** sRGB mean the detail maps were normalised to (linear ≈ 0.694). */
export const DETAIL_MEAN_SRGB = 0.85;

export function assetUrl(path: string): string {
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? "/";
  return base.replace(/\/?$/, "/") + path;
}

export interface TextureLoadReport {
  loaded: EnvTextureKey[];
  failed: EnvTextureKey[];
}

/** Load every set texture; never rejects. */
export async function loadEnvTextures(anisotropy = 4, dir = "assets/textures/"): Promise<{ textures: EnvTextures; report: TextureLoadReport }> {
  const loader = new THREE.TextureLoader();
  const textures: EnvTextures = {};
  const report: TextureLoadReport = { loaded: [], failed: [] };
  await Promise.all(
    (Object.keys(ENV_TEXTURE_FILES) as EnvTextureKey[]).map(async (k) => {
      try {
        const t = await loader.loadAsync(assetUrl(dir + ENV_TEXTURE_FILES[k]));
        t.name = `tex:${k}`;
        t.wrapS = t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = anisotropy;
        t.colorSpace = k.endsWith("N") ? THREE.NoColorSpace : THREE.SRGBColorSpace;
        textures[k] = t;
        report.loaded.push(k);
      } catch {
        report.failed.push(k);
      }
    }),
  );
  return { textures, report };
}
