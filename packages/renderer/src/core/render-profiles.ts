import type { CameraMode, RenderProfile, EffectsCapabilities } from "./types";

export interface LightingProfile {
  backgroundColor: number;
  fogColor: number;
  fogDensity: number;
  exposure: number;
  ambientIntensity: number;
  hemisphereSkyIntensity: number;
  hemisphereGroundIntensity: number;
  directionalIntensity: number;
}

export interface EffectsProfile {
  bloom: {
    threshold: number;
    strength: number;
    radius: number;
  };
  vignette: {
    offset: number;
    darkness: number;
  };
  ssao: {
    enabled: boolean;
    radius: number;
    minDistance: number;
    maxDistance: number;
  };
}

const LIGHTING_PROFILES: Record<RenderProfile, LightingProfile> = {
  play: {
    backgroundColor: 0x2a3c51,
    fogColor: 0x2a3c51,
    fogDensity: 0.00032,
    exposure: 1.38,
    ambientIntensity: 2.8,
    hemisphereSkyIntensity: 1.22,
    hemisphereGroundIntensity: 0.62,
    directionalIntensity: 5.15,
  },
  showcase: {
    backgroundColor: 0x3a5571,
    fogColor: 0x3a5571,
    fogDensity: 0.0007,
    exposure: 2.12,
    ambientIntensity: 2.38,
    hemisphereSkyIntensity: 1.62,
    hemisphereGroundIntensity: 0.76,
    directionalIntensity: 4.8,
  },
  showcaseCinematic: {
    backgroundColor: 0x40607c,
    fogColor: 0x40607c,
    fogDensity: 0.001,
    exposure: 2.28,
    ambientIntensity: 2.12,
    hemisphereSkyIntensity: 1.82,
    hemisphereGroundIntensity: 0.88,
    directionalIntensity: 4.55,
  },
};

const EFFECTS_PROFILES: Record<RenderProfile, EffectsProfile> = {
  play: {
    bloom: { threshold: 3, strength: 0.3, radius: 0.3 },
    vignette: { offset: 0.06, darkness: 0.12 },
    ssao: { enabled: false, radius: 8, minDistance: 0.001, maxDistance: 0.12 },
  },
  showcase: {
    bloom: { threshold: 2.0, strength: 0.38, radius: 0.5 },
    vignette: { offset: 0.08, darkness: 0.1 },
    ssao: { enabled: false, radius: 10, minDistance: 0.001, maxDistance: 0.18 },
  },
  showcaseCinematic: {
    bloom: { threshold: 1.8, strength: 0.48, radius: 0.62 },
    vignette: { offset: 0.12, darkness: 0.16 },
    ssao: { enabled: true, radius: 12, minDistance: 0.001, maxDistance: 0.22 },
  },
};

export function getRenderProfileForCameraMode(mode: CameraMode): RenderProfile {
  return mode === "play" ? "play" : "showcase";
}

export function getLightingProfile(profile: RenderProfile): LightingProfile {
  return LIGHTING_PROFILES[profile];
}

export function getEffectsProfile(profile: RenderProfile): EffectsProfile {
  return EFFECTS_PROFILES[profile];
}

export function resolveEffectsProfile(
  profile: RenderProfile,
  capabilities: EffectsCapabilities = {},
): EffectsProfile {
  const base = getEffectsProfile(profile);
  const resolved: EffectsProfile = {
    bloom: { ...base.bloom },
    vignette: { ...base.vignette },
    ssao: { ...base.ssao },
  };

  if (capabilities.supportsSSAO === false) {
    resolved.ssao.enabled = false;
  }
  if (capabilities.supportsBloom === false) {
    resolved.bloom.strength = 0;
    resolved.bloom.radius = 0;
  }
  if (capabilities.supportsVignette === false) {
    resolved.vignette.offset = 0;
    resolved.vignette.darkness = 0;
  }

  if (capabilities.lowPowerDevice) {
    resolved.ssao.enabled = false;
    resolved.bloom.strength *= 0.45;
    resolved.bloom.radius *= 0.6;
    resolved.vignette.darkness *= 0.5;
  }

  return resolved;
}
