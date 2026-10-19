import { describe, expect, it } from "vitest";
import { failedModuleUrl, reimport } from "../src/lib/reimport";

// A failed chunk download, asked for again under another URL (#539 review): the browser keeps the failed module for the page's life.
describe("reimport", () => {
  it("reads the URL Chromium and Firefox name in a failed import, and none from Safari's message", () => {
    expect(failedModuleUrl(new TypeError("Failed to fetch dynamically imported module: https://paved.gg/assets/final-board-CYicjQmX.js"))).toBe(
      "https://paved.gg/assets/final-board-CYicjQmX.js",
    );
    expect(failedModuleUrl(new TypeError("error loading dynamically imported module: http://localhost:6006/assets/final-board-x.js"))).toBe(
      "http://localhost:6006/assets/final-board-x.js",
    );
    expect(failedModuleUrl(new TypeError("Importing a module script failed."))).toBeNull();
    expect(failedModuleUrl(null)).toBeNull();
  });

  it("imports the named module again under a URL of its own each try, and rejects with the error when there is none", async () => {
    const asked: string[] = [];
    const load = async (url: string) => (asked.push(url), { default: 42 });
    const failed = new TypeError("Failed to fetch dynamically imported module: https://paved.gg/assets/final-board-CYicjQmX.js");
    expect((await reimport<{ default: number }>(failed, 1, load)).default).toBe(42);
    await reimport(failed, 2, load);
    expect(asked).toEqual(["https://paved.gg/assets/final-board-CYicjQmX.js?retry=1", "https://paved.gg/assets/final-board-CYicjQmX.js?retry=2"]);
    const safari = new TypeError("Importing a module script failed.");
    await expect(reimport(safari, 3, load)).rejects.toBe(safari);
    expect(asked).toHaveLength(2);
  });
});
