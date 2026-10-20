// The snow on the tiles' tops (WEATHER-STUDY, #607 PR 2): a term of the tile shader, in the board's chunk as the clouds' is, since
// every tile compiles to one program. It costs a branch until the weather's chunk (`weather.ts`, stories only) sets its cover: at
// 0 the term returns before it reads anything. The board never sets it.
import * as THREE from "three";

/** The snow's uniforms, shared by every patched tile material (`TileRenderer.snowUniforms`), written by the weather only. */
export interface SnowUniforms {
  /** The share of the faces up under snow, in patches: 0 turns the term off. */
  uSnowCover: { value: number };
  /** The snow's colour, linear. */
  uSnowColor: { value: THREE.Color };
}

export function createSnowUniforms(): SnowUniforms {
  return { uSnowCover: { value: 0 }, uSnowColor: { value: new THREE.Color(0.86, 0.9, 0.96) } };
}

/** The voxels a world unit holds (a tile of 3 is 40 voxels across): the snow is drawn voxel by voxel, as the models are. */
export const SNOW_VOXELS_PER_UNIT = 40 / 3;

/** The snow's drifts: a value noise of cells this many voxels across, so the snow lies in patches, not voxel by voxel at random. */
export const SNOW_DRIFT_VOXELS = 7;

/**
 * The fragment's declarations (after the clouds', which declare `vCloudWorld`, the fragment's place in the world). A face is
 * under snow by how much it faces up (`normal`, view space, against the world's up in view space, the view matrix's second
 * column) and by the cover against a drift noise read at the voxel under the fragment (a value noise of `SNOW_DRIFT_VOXELS`
 * cells, a little of each voxel's own hash on its edge): the snow lies in patches that grow with the cover, cut on the voxels.
 */
export const SNOW_FRAGMENT_GLSL = /* glsl */ `
uniform float uSnowCover;
uniform vec3 uSnowColor;
float snowHash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
float snowOn(vec3 viewNormal) {
  if (uSnowCover <= 0.0) return 0.0;
  float up = smoothstep(0.55, 0.9, dot(viewNormal, normalize(viewMatrix[1].xyz)));
  vec2 voxel = floor(vCloudWorld.xz * ${SNOW_VOXELS_PER_UNIT.toFixed(4)} + 0.001);
  vec2 cell = voxel / ${SNOW_DRIFT_VOXELS.toFixed(1)};
  vec2 i = floor(cell);
  vec2 f = fract(cell);
  f = f * f * (3.0 - 2.0 * f);
  float drift = mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), f.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0)), f.x), f.y);
  float n = 0.8 * drift + 0.2 * snowHash(voxel);
  return up * step(n, uSnowCover);
}
`;

/** After three's `normal_fragment_maps` (the face's normal is known, the light not yet computed): the diffuse whitened. */
export const SNOW_APPLY_GLSL = /* glsl */ `
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowOn(normal));
`;
