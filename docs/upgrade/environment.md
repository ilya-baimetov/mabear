# Environment revision

The environment remains live 3D. Existing scene anchors, navigation marks, height functions, object names, and manifest overrides are retained. The initial procedural canopy revision failed visual review; the forest now uses authored, textured Quaternius models with real branching and individually defined foliage silhouettes.

| Element | Revision | Runtime approach |
| --- | --- | --- |
| Forest | Four pine forms, three broadleaf forms and two white-barked birch forms, varied height/rotation and irregular clustered placement | Shared GLTF prototypes and materials; instanced draws; simpler pine variant at distance |
| Hero trees | Authored pines at the hammock and large-pine anchors; authored broadleaf canopy around the swing tree | Original swing trunk, branch, pivot and gameplay anchors preserved |
| Undergrowth | Authored shrubs and fern stands, denser slender grass, moss patches on stones | Instanced shrubs/ferns; existing single grass draw; other geometry merged |
| Cabin | Smoother logs, cedar roof shakes, shaped foundation stones, beveled window crowns, sage shutters, door hinges and porch braces | Merged into existing wood/paint/metal/stone batches |
| Flowers | Cupped petal rings, raised centres, stems and leaves; planter flowers and lilies | Solid lit geometry merged into foliage batch |
| Pond and creek | Less saturated teal depth gradient and deterministic animated fine ripple normals | One composed material hook; no render target or extra pass |

## Authored asset provenance

Models and textures are by **Quaternius**, distributed under **CC0 1.0**. Only the freely distributed standard packs are used. Assets are served locally from `public/assets/nature`; the browser has no third-party model dependency.

| Local assets | Author's primary source | License evidence |
| --- | --- | --- |
| `Pine_1`, `Pine_2`, `Pine_3`, `Pine_5`, `CommonTree_1`, `CommonTree_2`, `CommonTree_4`, `Bush_Common`, `Fern_1`, associated textures | [Stylized Nature MegaKit](https://quaternius.com/packs/stylizednaturemegakit.html), free Standard download through the author's [itch.io page](https://quaternius.itch.io/stylized-nature-megakit) | Pack's unchanged `public/assets/nature/LICENSE.txt`; author page identifies CC0 |
| `BirchTree_1`, `BirchTree_3`, associated textures | [Ultimate Stylized Nature](https://quaternius.com/packs/ultimatestylizednature.html), author's linked [public download folder](https://drive.google.com/drive/folders/1IV3bXHzkNvuNWFHPi4KPx-G4ghuxIuT-) | Author page identifies CC0; unchanged `public/assets/nature/LICENSE-ultimate.txt` from that folder |

The latter bundled license has an unrelated “Ultimate Platformer Pack” heading in the author's original file; it is preserved verbatim. The Nature pack's own primary page separately confirms its CC0 dedication. License terms: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

Local changes: selected only eleven required models; discarded unused variants and textures; repointed MegaKit leaves to the pack's neutral alpha textures for art-directed green tint; resized broadleaf and birch bark maps to 1024 pixels and compressed bark base colour as JPEG. Foliage alpha images and model geometry are retained. Runtime normalizes model height, adds per-instance colour variation, tunes roughness/normal strength and uses alpha-tested, double-sided foliage. Payload is approximately 8.9 MB before transfer compression. Existing HDRI and ground-map provenance remains in `docs/ASSETS.md`.

## Loading and verification

`SetHandle.assetsReady` joins all requested vegetation jobs; `natureStatus()` exposes loaded and failed model IDs. A failed request inserts a local procedural fallback at that group's exact anchors. Other models continue loading. Asset ownership disposes geometries, materials and textures, including resources returned after stage disposal.

`npm run typecheck` and the asset/look unit tests pass (21 tests). Every GLTF buffer and image reference resolves to a bundled local file; no unused texture or model file remains. These checks do not substitute for rendering review. The integrating agent's `yard-authored-pass1.png` demonstrated the corrected silhouettes; final lighting, birch rendering, scene coverage, failed-network browser behaviour and measured runtime performance require integrated browser review.

Integrated browser verification: all eleven authored models loaded with zero failures. Blocking every nature GLTF request produced the expected local fallbacks and a rendered scene; clearing the block restored all eleven models. Final birch/forest render is recorded in `screenshots/yard-final.png`.
