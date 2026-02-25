import { describe, expect, test } from "vitest";
import { ModeType } from "../src/types/mode";
import { validateGameConfigInput } from "../src/types/game-config";

describe("validateGameConfigInput", () => {
  test("rejects private game without access root", () => {
    const errors = validateGameConfigInput({
      mode: ModeType.Daily,
      deckId: 2,
      entryPrice: 1_000_000_000_000_000_000n,
      durationSeconds: 86_400,
      tileLimit: 38,
      allowDiscard: true,
      allowSurrender: true,
      privateGame: true,
      accessRoot: 0,
      metadataUriHash: 0,
    });
    expect(errors).toContain("privateGame requires non-zero accessRoot");
  });

  test("accepts valid minimal config", () => {
    const errors = validateGameConfigInput({
      mode: ModeType.Daily,
      deckId: 2,
      entryPrice: 1_000_000_000_000_000_000n,
      durationSeconds: 86_400,
      tileLimit: 38,
      allowDiscard: true,
      allowSurrender: true,
      privateGame: false,
      accessRoot: 0,
      metadataUriHash: 0,
    });
    expect(errors).toEqual([]);
  });
});
