import { describe, expect, it } from "vitest";
import { DEFAULT_SMOKE_SETTINGS, NO_SMOKE_VARIATION, SMOKE_LOOKS, SMOKE_VARIATION, smokeLookOf } from "@paved/renderer";
import meta from "../src/stories/renderer/chimney-smoke.stories";
import { smokeInput, type ChimneySmokeBoardProps } from "../src/stories/renderer/chimney-smoke-board";

const ARGS = meta.args as ChimneySmokeBoardProps;

describe("the chimney smoke study's look", () => {
  it("draws the chosen look: switching the look alone changes every knob left unset", () => {
    expect(smokeLookOf(smokeInput(ARGS))).toEqual(smokeLookOf(DEFAULT_SMOKE_SETTINGS));
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "puffs" }))).toEqual(SMOKE_LOOKS.puffs);
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "wisps" }))).toEqual(SMOKE_LOOKS.wisps);
  });

  it("keeps a knob that was moved over either look", () => {
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "wisps", opacity: 0.2 }))).toEqual({ ...SMOKE_LOOKS.wisps, opacity: 0.2 });
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "puffs", puffs: 4 }))).toEqual({ ...SMOKE_LOOKS.puffs, puffs: 4 });
  });

  it("draws the default look, the owner's (#801): slower, subtler, each chimney its own plume", () => {
    const look = smokeLookOf(smokeInput(ARGS));
    expect(look).toEqual(SMOKE_LOOKS.varied);
    expect(look).toMatchObject({ lifeSeconds: 8, opacity: 0.4, roll: SMOKE_LOOKS.puffs.roll / 2, swaySpeed: 0.5 });
    expect(look.variation).toEqual(SMOKE_VARIATION);
  });

  it("takes each variation knob alone over the look's", () => {
    expect(smokeLookOf(smokeInput({ ...ARGS, varyTone: 0.2 })).variation).toEqual({ ...SMOKE_VARIATION, tone: 0.2 });
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "puffs", varyTone: 0.2 })).variation).toEqual({ ...NO_SMOKE_VARIATION, tone: 0.2 });
  });
});
