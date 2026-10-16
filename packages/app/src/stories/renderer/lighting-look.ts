import { LOOK_PRESETS, TONE_MAPPING_MODES, type LookSettings, type LookSettingsInput } from "@paved/renderer";

/**
 * The look's fields (`LookSettings`) as flat story args, `<group><Field>` (`keyIntensity`, `aoRadius`,
 * `toneMappingMode`...), with their controls: the "Renderer/Lighting" stories set any of them over the chosen preset.
 */
type Group = keyof LookSettings;
type Value = string | number | boolean;

export interface LookField {
  arg: string;
  group: Group;
  field: string;
}

const capitalise = (s: string) => s[0].toUpperCase() + s.slice(1);

const GROUP_LABELS: Record<Group, string> = {
  key: "Key light",
  fill: "Fill light",
  sky: "Sky light",
  ao: "Ambient occlusion",
  toneMapping: "Tone mapping",
  grade: "Grade",
  vignette: "Vignette",
  fog: "Fog",
  background: "Background",
  bloom: "Bloom",
  highlights: "Highlights",
  water: "Water",
};

/** Range of each numeric field: [min, max, step]. */
const RANGES: Record<string, [number, number, number]> = {
  intensity: [0, 8, 0.05],
  azimuth: [-180, 180, 1],
  elevation: [5, 90, 1],
  shadowSoftness: [0, 8, 0.25],
  ambient: [0, 2, 0.05],
  radius: [0, 2, 0.01],
  resolution: [0.25, 1, 0.25],
  exposure: [0.2, 3, 0.05],
  saturation: [0, 2, 0.01],
  contrast: [0.5, 1.5, 0.01],
  warmth: [-0.3, 0.3, 0.01],
  offset: [0, 2, 0.05],
  darkness: [0, 1, 0.01],
  density: [0, 0.01, 0.0001],
  strength: [0, 2, 0.01],
  threshold: [0, 4, 0.05],
  slotIntensity: [0, 6, 0.1],
  ghostIntensity: [0, 3, 0.05],
  brightness: [0.5, 2, 0.01],
  roughness: [0, 1, 0.01],
};
/** The AO's radius is in world units, the bloom's a share of its blur. */
const RANGE_OVERRIDES: Record<string, [number, number, number]> = { aoIntensity: [0, 1.5, 0.01], bloomRadius: [0, 1, 0.01] };

const MOCKUP = LOOK_PRESETS.mockup;

export const LOOK_FIELDS: LookField[] = (Object.keys(MOCKUP) as Group[]).flatMap((group) => {
  const value = MOCKUP[group];
  if (typeof value !== "object") return [{ arg: group, group, field: "" }];
  return Object.keys(value).map((field) => ({ arg: `${group}${capitalise(field)}`, group, field }));
});

function sample(f: LookField): Value {
  const group = MOCKUP[f.group] as unknown;
  return (f.field ? (group as Record<string, Value>)[f.field] : group) as Value;
}

/** The controls of the look's args, one category per group. */
export function lookArgTypes(): Record<string, object> {
  const types: Record<string, object> = {};
  for (const f of LOOK_FIELDS) {
    const v = sample(f);
    const table = { category: GROUP_LABELS[f.group] };
    const name = f.field || f.group;
    if (f.arg === "toneMappingMode") types[f.arg] = { control: "inline-radio", options: TONE_MAPPING_MODES, table };
    else if (typeof v === "boolean") types[f.arg] = { control: "boolean", table };
    else if (typeof v === "string") types[f.arg] = { control: "color", table };
    else {
      const [min, max, step] = RANGE_OVERRIDES[f.arg] ?? RANGES[name] ?? [0, 4, 0.01];
      types[f.arg] = { control: { type: "range", min, max, step }, table };
    }
  }
  return types;
}

/** The look's args that are set, as the renderer's partial look: unset args keep the preset's value. */
export function lookInput(args: Record<string, unknown>): LookSettingsInput {
  const input: Record<string, unknown> = {};
  for (const f of LOOK_FIELDS) {
    const v = args[f.arg];
    if (v === undefined || v === null) continue;
    if (!f.field) input[f.group] = v;
    else input[f.group] = { ...(input[f.group] as object | undefined), [f.field]: v };
  }
  return input as LookSettingsInput;
}
