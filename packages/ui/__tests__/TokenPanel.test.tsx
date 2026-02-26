import { describe, expect, it } from "vitest";
import { resolveTokenPanelState } from "../src/components/TokenPanel";

describe("TokenPanel", () => {
  it("shows loading mint state", () => {
    expect(
      resolveTokenPanelState({
        supportsMint: true,
        isMinting: true,
        error: null,
      })
    ).toEqual({
      actionLabel: "Minting...",
      actionDisabled: true,
      statusTone: "loading",
      statusText: "Transaction pending",
    });
  });

  it("shows error state when mint fails", () => {
    expect(
      resolveTokenPanelState({
        supportsMint: true,
        isMinting: false,
        error: "Mint reverted",
      })
    ).toEqual({
      actionLabel: "Mint Test Tokens",
      actionDisabled: false,
      statusTone: "error",
      statusText: "Mint reverted",
    });
  });

  it("disables mint action when profile does not support mint", () => {
    expect(
      resolveTokenPanelState({
        supportsMint: false,
        isMinting: false,
        error: null,
      })
    ).toEqual({
      actionLabel: "Mint Unavailable",
      actionDisabled: true,
      statusTone: "idle",
      statusText: "Mint disabled for this network",
    });
  });
});
