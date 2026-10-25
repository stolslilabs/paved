import { describe, expect, it } from "vitest";
import { SMOKE_LOOKS, smokeLookOf } from "@paved/renderer";
import meta from "../src/stories/renderer/chimney-smoke.stories";
import { smokeInput, type ChimneySmokeBoardProps } from "../src/stories/renderer/chimney-smoke-board";

const ARGS = meta.args as ChimneySmokeBoardProps;

describe("the chimney smoke study's look", () => {
  it("draws the chosen look: switching the look alone changes every knob left unset", () => {
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "puffs" }))).toEqual(SMOKE_LOOKS.puffs);
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "wisps" }))).toEqual(SMOKE_LOOKS.wisps);
  });

  it("keeps a knob that was moved over either look", () => {
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "wisps", opacity: 0.2 }))).toEqual({ ...SMOKE_LOOKS.wisps, opacity: 0.2 });
    expect(smokeLookOf(smokeInput({ ...ARGS, look: "puffs", puffs: 4 }))).toEqual({ ...SMOKE_LOOKS.puffs, puffs: 4 });
  });
});
