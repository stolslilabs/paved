import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// vitest runs with the package as its working directory.
describe("index.html", () => {
  const doc = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html");

  it("holds exactly one #root, inside the body (main.tsx mounts on it)", () => {
    expect(doc.querySelectorAll("#root")).toHaveLength(1);
    expect(doc.body.querySelector("#root")).not.toBeNull();
  });

  it("loads main.tsx from the body and the font preloads from the head", () => {
    expect(doc.body.querySelector('script[src="/src/main.tsx"]')).not.toBeNull();
    expect(doc.head.querySelector('script[type="module"]:not([src])')?.textContent).toContain("preloadFonts");
  });
});
