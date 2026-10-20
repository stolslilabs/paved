// The cloud shadows' term in the tile shader (CLOUD-SHADOWS, #573): in the board's chunk, since every tile compiles to one
// program that holds it. It costs nothing until the effect's chunk (`cloud-shadows.ts`) sets its uniforms: the darkness is 0,
// and the term returns before it reads the cloud map.
import * as THREE from "three";

/**
 * The cloud term's uniforms, shared by every patched tile material (`TileRenderer.cloudUniforms`) and written by the effect only.
 * `uCloudMap` is a soft tileable noise (one channel); a fragment reads it where its line to the sun crosses the clouds' height
 * (`uCloudHeight`), at `xz * uCloudScale + uCloudOffset`, and is under a cloud by `smoothstep(uCloudEdge.x, uCloudEdge.y, n)`.
 */
export interface CloudUniforms {
  uCloudMap: { value: THREE.Texture };
  uCloudScale: { value: number };
  uCloudOffset: { value: THREE.Vector2 };
  uCloudEdge: { value: THREE.Vector2 };
  uCloudHeight: { value: number };
  /** The share of the sun's direct light a cloud's core takes: 0 turns the term off. */
  uCloudDark: { value: number };
  /** The share of that darkness the other directional lights (the moon at night) take: the effect sets it, 0 by day. */
  uCloudMoon: { value: number };
}

/** The map the term points at before the effect's chunk is in: one clear texel, never read while the darkness is 0. */
const CLEAR_SKY = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
CLEAR_SKY.needsUpdate = true;

export function createCloudUniforms(): CloudUniforms {
  return {
    uCloudMap: { value: CLEAR_SKY },
    uCloudScale: { value: 1 },
    uCloudOffset: { value: new THREE.Vector2() },
    uCloudEdge: { value: new THREE.Vector2(1, 1.001) },
    uCloudHeight: { value: 0 },
    uCloudDark: { value: 0 },
    uCloudMoon: { value: 0 },
  };
}

/** The tile vertex shader's part: the fragment's place in the world (`vCloudWorld`), for the line to the light. */
export const CLOUD_VERTEX_GLSL = /* glsl */ `
  vCloudWorld = (modelMatrix * vec4(position, 1.0)).xyz;
`;

/**
 * The fragment shader's declarations and `cloudLight(direction)`: the light left to a directional light (its view-space
 * direction, towards the light) under the clouds, 1 in the clear. The direction is turned back to the world by the view matrix
 * (a rotation: its transpose is its inverse), so the shadows follow the sun with no uniform of their own.
 */
export const CLOUD_FRAGMENT_GLSL = /* glsl */ `
uniform sampler2D uCloudMap;
uniform float uCloudScale;
uniform vec2 uCloudOffset;
uniform vec2 uCloudEdge;
uniform float uCloudHeight;
uniform float uCloudDark;
uniform float uCloudMoon;
varying vec3 vCloudWorld;
float cloudLight(vec3 lightDirection, float strength) {
  if (uCloudDark * strength <= 0.0) return 1.0;
  vec3 toLight = normalize((vec4(lightDirection, 0.0) * viewMatrix).xyz);
  vec3 atClouds = vCloudWorld + toLight * ((uCloudHeight - vCloudWorld.y) / max(toLight.y, 0.05));
  float cloud = smoothstep(uCloudEdge.x, uCloudEdge.y, texture2D(uCloudMap, atClouds.xz * uCloudScale + uCloudOffset).r);
  return 1.0 - uCloudDark * strength * cloud;
}
`;

/** The line of three's `lights_fragment_begin` that shades a shadow-casting directional light (the sun and its twin). */
const SUN_SHADOW_LINE = /directLight\.color \*= \( directLight\.visible && receiveShadow \) \? getShadow\( directionalShadowMap\[ i \][^\n]*\n\t\t#endif\n/;

/**
 * three's `lights_fragment_begin` with the clouds on the directional lights: the shadow-casting ones (the sun, `GameScene`'s key
 * light, and its twin while the cycle crossfades) by the full darkness; the others (the fill, the moon at night) by `uCloudMoon`,
 * which the effect sets from the cycle's night (never from the night lights' uniforms: the windows have a switch of their own).
 * The ambient, sky and point lights are left as they are. Throws if three's chunk no longer has the line it hooks.
 */
export function cloudLightsFragment(chunk: string = THREE.ShaderChunk.lights_fragment_begin): string {
  const match = SUN_SHADOW_LINE.exec(chunk);
  if (!match) throw new Error("[renderer] the cloud shadows found no sun shadow line in three's lights_fragment_begin");
  const hooked = [
    match[0],
    "\t\t#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )",
    "\t\tdirectLight.color *= cloudLight( directionalLight.direction, 1.0 );",
    "\t\t#else",
    "\t\tdirectLight.color *= cloudLight( directionalLight.direction, uCloudMoon );",
    "\t\t#endif",
    "",
  ].join("\n");
  return chunk.replace(match[0], hooked);
}
