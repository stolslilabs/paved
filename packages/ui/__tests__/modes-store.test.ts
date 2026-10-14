import { describe, expect, it } from "vitest";
import { ModeType } from "@paved/game-core";

describe("modes store (was the lobby store; lobby is kept for multiplayer)", () => {
  it("is exported as useModesStore, and useLobbyStore is gone", async () => {
    const mod = (await import("../src/index")) as Record<string, unknown>;
    expect(mod.useModesStore).toBeDefined();
    expect(mod.useLobbyStore).toBeUndefined();
  });

  it("keeps the mode and the player entity", async () => {
    const { useModesStore } = await import("../src/stores");
    expect(useModesStore.getState().mode).toBe(ModeType.Challenge);
    useModesStore.getState().setPlayerEntity("0x1");
    expect(useModesStore.getState().playerEntity).toBe("0x1");
    useModesStore.getState().setPlayerEntity(null);
  });
});
