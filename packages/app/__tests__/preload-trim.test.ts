import { describe, expect, it } from "vitest";
import { preloadTrim } from "../vite/preload-trim";

// The preload lists without what the importing chunk loads statically (#952): the entry's page loaders stop listing the chunks the
// entry has already run, and what the browser fetches does not change.

type Resolve = (file: string, deps: string[], ctx: { hostId: string; hostType: "html" | "js" }) => string[];

function setUp(bundle: Record<string, { type: "chunk"; imports: string[] } | { type: "asset" }>) {
  const plugin = preloadTrim();
  const config = (plugin.config as () => { build: { modulePreload: { resolveDependencies: Resolve } } })();
  const resolve = config.build.modulePreload.resolveDependencies;
  const generate = plugin.generateBundle as { order: string; handler: (options: unknown, bundle: unknown) => void };
  return { resolve, generate: () => generate.handler({}, bundle), order: generate.order };
}

describe("preloadTrim", () => {
  const bundle = {
    "assets/index.js": { type: "chunk" as const, imports: ["assets/react.js", "assets/shared.js"] },
    "assets/react.js": { type: "chunk" as const, imports: ["assets/jsx.js"] },
    "assets/jsx.js": { type: "chunk" as const, imports: [] },
    "assets/shared.js": { type: "chunk" as const, imports: [] },
    "assets/page.js": { type: "chunk" as const, imports: ["assets/react.js", "assets/page-dep.js"] },
    "assets/page-dep.js": { type: "chunk" as const, imports: ["assets/jsx.js"] },
  };

  it("runs before Vite writes the lists, and leaves a list whole until it has the bundle", () => {
    const { resolve, order } = setUp(bundle);
    expect(order).toBe("pre");
    expect(resolve("assets/page.js", ["assets/react.js", "assets/page-dep.js"], { hostId: "assets/index.js", hostType: "js" })).toEqual(["assets/react.js", "assets/page-dep.js"]);
  });

  it("drops the chunks the importer imports statically, all the way down, and keeps the others", () => {
    const { resolve, generate } = setUp(bundle);
    generate();
    const deps = ["assets/react.js", "assets/jsx.js", "assets/page-dep.js", "assets/shared.js"];
    expect(resolve("assets/page.js", deps, { hostId: "assets/index.js", hostType: "js" })).toEqual(["assets/page-dep.js"]);
    // From a chunk that loads none of them, the list stays whole.
    expect(resolve("assets/page.js", deps, { hostId: "assets/shared.js", hostType: "js" })).toEqual(deps);
    // The HTML's own preloads are not touched.
    expect(resolve("assets/index.js", deps, { hostId: "index.html", hostType: "html" })).toEqual(deps);
  });
});
