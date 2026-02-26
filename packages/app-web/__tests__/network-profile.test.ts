import { describe, expect, it } from "vitest";
import { resolveAppNetworkProfile } from "../src/utils/network-profile";

describe("resolveAppNetworkProfile", () => {
  it("uses local defaults when profile env is missing", () => {
    const profile = resolveAppNetworkProfile({
      VITE_WORLD_ADDRESS: "0x123",
    } as any);

    expect(profile.key).toBe("local");
    expect(profile.supportsMint).toBe(true);
    expect(profile.worldAddress).toBe("0x123");
  });

  it("maps slot profile and capability flag deterministically", () => {
    const profile = resolveAppNetworkProfile({
      VITE_CHAIN_PROFILE: "slot",
      VITE_WORLD_ADDRESS: "0xabc",
      VITE_SUPPORTS_TOKEN_MINT: "false",
    } as any);

    expect(profile.key).toBe("slot");
    expect(profile.supportsMint).toBe(false);
    expect(profile.worldAddress).toBe("0xabc");
  });
});
