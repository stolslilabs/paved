import { describe, expect, it } from "vitest";
import { ModeType } from "@paved/game-core";
import {
  buildCreateGameRoute,
  defaultConfigForMode,
  resolveCreateOptions,
} from "../src/utils/create-options";

function routeToParams(route: string): URLSearchParams {
  const query = route.split("?")[1] ?? "";
  return new URLSearchParams(query);
}

describe("create options template flow", () => {
  it("builds and resolves template creation route", () => {
    const route = buildCreateGameRoute(ModeType.Daily, "template", 7);
    const resolved = resolveCreateOptions(ModeType.Daily, routeToParams(route), true);

    expect(route).toContain("create=template");
    expect(route).toContain("templateId=7");
    expect(resolved.fieldErrors).toEqual({});
    expect(resolved.options).toEqual({ templateId: 7 });
  });
});

describe("create options advanced config validation", () => {
  it("returns field-level errors for invalid custom config", () => {
    const params = new URLSearchParams(
      "mode=daily&create=custom&cfgDuration=0&cfgPrivateGame=1&cfgAccessRoot=0",
    );
    const resolved = resolveCreateOptions(ModeType.Daily, params, true);

    expect(Object.keys(resolved.fieldErrors).length).toBeGreaterThan(0);
    expect(resolved.options).toBeUndefined();
  });

  it("blocks custom config when feature flag is disabled", () => {
    const params = new URLSearchParams("mode=daily&create=custom");
    const resolved = resolveCreateOptions(ModeType.Daily, params, false);

    expect(resolved.fieldErrors.general).toContain("disabled");
    expect(resolved.options).toBeUndefined();
  });
});

describe("create options dispatch inputs", () => {
  it("returns legacy path without create options", () => {
    const resolved = resolveCreateOptions(ModeType.Weekly, new URLSearchParams("mode=weekly"), true);
    expect(resolved.createPath).toBe("legacy");
    expect(resolved.options).toBeUndefined();
  });

  it("returns custom config options for valid custom route", () => {
    const config = defaultConfigForMode(ModeType.Weekly);
    const route = buildCreateGameRoute(ModeType.Weekly, "custom", undefined, config);
    const resolved = resolveCreateOptions(ModeType.Weekly, routeToParams(route), true);

    expect(resolved.fieldErrors).toEqual({});
    expect(resolved.options?.configInput?.mode).toBe(ModeType.Weekly);
    expect(resolved.options?.configInput?.deckId).toBe(1);
  });
});
