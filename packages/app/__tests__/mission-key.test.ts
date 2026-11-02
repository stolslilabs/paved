import { describe, expect, it } from "vitest";
import { missionKeyOf } from "../src/components/containers/mission-key";

describe("a mission's key in a link (#978)", () => {
  it("is read as a key only when it is one", () => {
    expect(missionKeyOf("quest:12")).toBe("quest:12");
    expect(missionKeyOf("tutorial:3")).toBe("tutorial:3");
    expect(missionKeyOf("achievement:4")).toBe("achievement:4");
    for (const bad of [null, "", "quest", "quest:0", "quest:-1", "quest:1x", "bonus:1", "quest:1234567"]) expect(missionKeyOf(bad)).toBeUndefined();
  });
});
