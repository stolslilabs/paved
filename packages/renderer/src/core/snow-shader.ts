// The snow on the tiles' tops (WEATHER-STUDY, #607 PR 2; softened by WEATHER-WIRE, #658): a term of the tile shader, in the board's
// chunk as the clouds' is, since every tile compiles to one program. It costs a branch until the weather's chunk (`weather.ts`) sets
// its cover: at 0 the term returns before it reads anything.
import * as THREE from "three";

/** The snow's uniforms, shared by every patched tile material (`TileRenderer.snowUniforms`), written by the weather only. */
export interface SnowUniforms {
  /** The share of the faces up under a patch of snow: 0 turns the term off. */
  uSnowCover: { value: number };
  /** How white a patch is at its heart, 0 to 1: a veil, the tile shows through it. */
  uSnowVeil: { value: number };
  /** The snow's colour, linear. */
  uSnowColor: { value: THREE.Color };
}

export function createSnowUniforms(): SnowUniforms {
  return { uSnowCover: { value: 0 }, uSnowVeil: { value: 0 }, uSnowColor: { value: new THREE.Color(0.86, 0.9, 0.96) } };
}

/** The world units a patch of snow spans, about (a tile is 3): drifts of a third to a whole tile. */
export const SNOW_PATCH_UNITS = 1.6;

/** The width of a patch's soft edge, in the noise's units (0 to 1): wide, so a patch fades out instead of ending on a line. */
export const SNOW_EDGE = 0.16;

/**
 * The fragment's declarations (after the clouds', which declare `vCloudWorld`, the fragment's place in the world). A face is
 * under snow by how much it faces up (`normal`, view space, against the world's up in view space, the view matrix's second
 * column) and by the cover against a drift noise read at the fragment's own place in the world, never at a voxel or a cell: two
 * octaves of a smooth value noise, the second turned and offset so no grid shows, cut by a wide `smoothstep`. The patches are
 * rounded, with soft edges, and grow with the cover (owner, 2026-10-20: no squares). The veil sets how white their heart is.
 */
export const SNOW_FRAGMENT_GLSL = /* glsl */ `
uniform float uSnowCover;
uniform float uSnowVeil;
uniform vec3 uSnowColor;
float snowHash(vec2 v) { return fract(sin(dot(v, vec2(12.9898, 78.233))) * 43758.5453); }
float snowNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(snowHash(i), snowHash(i + vec2(1.0, 0.0)), f.x), mix(snowHash(i + vec2(0.0, 1.0)), snowHash(i + vec2(1.0)), f.x), f.y);
}
float snowOn(vec3 viewNormal) {
  if (uSnowCover <= 0.0) return 0.0;
  float up = smoothstep(0.55, 0.9, dot(viewNormal, normalize(viewMatrix[1].xyz)));
  vec2 p = vCloudWorld.xz / ${SNOW_PATCH_UNITS.toFixed(2)};
  float n = 0.65 * snowNoise(p) + 0.35 * snowNoise(mat2(0.8, -0.6, 0.6, 0.8) * p * 2.03 + vec2(17.3, 4.1));
  return up * uSnowVeil * smoothstep(n - ${SNOW_EDGE.toFixed(2)}, n + ${SNOW_EDGE.toFixed(2)}, uSnowCover);
}
`;

/** After three's `normal_fragment_maps` (the face's normal is known, the light not yet computed): the diffuse whitened. */
export const SNOW_APPLY_GLSL = /* glsl */ `
  diffuseColor.rgb = mix(diffuseColor.rgb, uSnowColor, snowOn(normal));
`;
