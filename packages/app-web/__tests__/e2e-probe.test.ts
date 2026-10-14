import { describe, expect, it } from "vitest";
import { attachE2eProbe, publishE2eView, type E2eProbe } from "../src/training/e2e-probe";

// The scene is only handed to the projection, which is not called here.
const scene = {} as Parameters<typeof attachE2eProbe>[0];

describe("the e2e probe", () => {
  it("does nothing when the test did not define it (production)", () => {
    const host: { __PAVED_E2E__?: E2eProbe } = {};
    attachE2eProbe(scene, host);
    publishE2eView({ orientation: 1, slots: [] }, host);
    expect(host).toEqual({});
  });

  it("fills the probe the test defined, and only it", () => {
    const probe: E2eProbe = {};
    const host = { __PAVED_E2E__: probe };
    attachE2eProbe(scene, host);
    publishE2eView({ orientation: 3, slots: [{ x: 1, y: -2 }] }, host);
    expect(probe.ready).toBe(true);
    expect(typeof probe.target).toBe("function");
    expect(probe.view).toEqual({ orientation: 3, slots: [{ x: 1, y: -2 }] });
  });
});
