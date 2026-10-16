import { describe, expect, it } from "vitest";

// The vitest config runs this package's tests under fr_FR and Europe/Paris (P-66). If this fails, the harness no longer
// proves the formatter independent of the user's locale: the other tests pass for the wrong reason.
describe("process locale (P-66)", () => {
  it("is French, in Paris: the runtime's own formatting differs from en-US", () => {
    expect(new Intl.NumberFormat().resolvedOptions().locale).toMatch(/^fr/);
    expect((1234.5).toLocaleString()).not.toBe("1,234.5");
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Paris");
  });
});
