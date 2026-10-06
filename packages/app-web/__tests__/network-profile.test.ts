import { describe, expect, it } from "vitest";
import { resolveAppNetworkProfile } from "../src/utils/network-profile";

describe("resolveAppNetworkProfile", () => {
  it("uses local defaults when profile env is missing", () => {
    const profile = resolveAppNetworkProfile({
      VITE_DAILY_ADDRESS: "0x123",
    } as any);

    expect(profile.key).toBe("local");
    expect(profile.supportsMint).toBe(true);
    expect(profile.addresses.daily).toBe("0x123");
    expect(profile.configured).toBe(false);
  });

  it("maps slot profile and capability flag deterministically", () => {
    const profile = resolveAppNetworkProfile({
      VITE_CHAIN_PROFILE: "slot",
      VITE_TOKEN_ADDRESS: "0xabc",
      VITE_SUPPORTS_TOKEN_MINT: "false",
    } as any);

    expect(profile.key).toBe("slot");
    expect(profile.supportsMint).toBe(false);
    expect(profile.addresses.token).toBe("0xabc");
  });

  it("is configured only when the four contract addresses are set", () => {
    const profile = resolveAppNetworkProfile({
      VITE_ACCOUNT_ADDRESS: "0x1",
      VITE_DAILY_ADDRESS: "0x2",
      VITE_TUTORIAL_ADDRESS: "0x3",
      VITE_TOKEN_ADDRESS: "0x4",
    } as any);

    expect(profile.configured).toBe(true);
  });
});
