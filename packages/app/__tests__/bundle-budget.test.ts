import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { forbidden, dynamicImports, htmlAssets, measureDist, METRICS, mockEnv, overBudget, pageNames, readBudget, SHIM_MARK, STARKNET_MARK, starknetInMock, staticImports, type Sizes } from "../scripts/bundle-budget";

const size = (raw: number, gzip: number) => ({ raw, gzip });
const sizes = (over: Partial<Sizes> = {}): Sizes => ({
  entry: size(100, 40),
  largestRoute: size(300, 100),
  firstLoadJs: size(500, 200),
  css: size(50, 10),
  fontAwesome: size(90, 30),
  ...over,
});

describe("the bundle budget", () => {
  it("has a raw and a gzip limit for each metric, in the one file", () => {
    const { limits, firstLoad } = readBudget();
    expect(Object.keys(limits).sort()).toEqual([...METRICS].sort());
    for (const m of METRICS) {
      expect(limits[m].raw).toBeGreaterThan(0);
      expect(limits[m].gzip).toBeGreaterThan(0);
    }
    expect(pageNames()).toContain(firstLoad.route);
  });

  it("passes at the limit and says which figure is over, and by how much, past it", () => {
    expect(overBudget(sizes(), sizes())).toEqual([]);
    const messages = overBudget(sizes({ entry: size(101, 40), css: size(50, 12) }), sizes());
    expect(messages).toEqual([
      "entry raw is 101 bytes (0.1 KiB), 1 over its budget of 100 (0.1 KiB)",
      "css gzip is 12 bytes (0.0 KiB), 2 over its budget of 10 (0.0 KiB)",
    ]);
  });
});

describe("reading a build", () => {
  it("finds the static imports of a chunk and not its dynamic ones", () => {
    const code = 'import{t as e}from"./a-1.js";import"./b-2.js";export*from"./c-3.js";const x=()=>import("./d-4.js");import f from"./e-5.js";';
    expect(staticImports(code).sort()).toEqual(["a-1.js", "b-2.js", "c-3.js", "e-5.js"]);
  });

  it("finds the files a chunk loads with import()", () => {
    expect(dynamicImports('const a=import(`./a-1.js`);import("./b-2.js");import{x}from"./c-3.js";import("https://x/y.js")').sort()).toEqual(["a-1.js", "b-2.js"]);
  });

  it("finds the module script, the preloads and the stylesheets of index.html", () => {
    const html = `<script type="module" crossorigin src="/assets/index-A.js"></script>
      <link rel="modulepreload" crossorigin href="/assets/x-B.js"><link rel="stylesheet" crossorigin href="/assets/index-C.css">`;
    expect(htmlAssets(html)).toEqual({ entry: "assets/index-A.js", preloads: ["assets/x-B.js"], css: ["assets/index-C.css"] });
  });

  it("measures a build: the entry, the biggest page, the first load of / with what it imports, the stylesheets", () => {
    const dist = mkdtempSync(join(tmpdir(), "budget-"));
    mkdirSync(join(dist, "assets"));
    mkdirSync(join(dist, "fontawesome/js"), { recursive: true });
    const put = (file: string, text: string) => writeFileSync(join(dist, file), text);
    put("index.html", '<script type="module" src="/assets/index-AAAAAAAA.js"></script><link rel="stylesheet" href="/assets/index-CCCCCCCC.css">');
    put("assets/index-AAAAAAAA.js", 'import"./shared-SSSSSSSS.js";const p=import("./home-HHHHHHHH.js");const q=import("./board-BBBBBBBB.js");' + pageNames().map((n) => `import("./${n}-PPPPPPPP.js");`).join(""));
    put("assets/shared-SSSSSSSS.js", "x".repeat(1000));
    put("assets/home-HHHHHHHH.js", 'import{a}from"./lib-LLLLLLLL.js";' + "h".repeat(500));
    put("assets/lib-LLLLLLLL.js", "l".repeat(200));
    put("assets/board-BBBBBBBB.js", "b".repeat(5000));
    for (const page of pageNames().filter((p) => p !== "board" && p !== "home")) put(`assets/${page}-PPPPPPPP.js`, "p");
    put("assets/index-CCCCCCCC.css", "c".repeat(300));
    put("fontawesome/js/solid.min.js", "s".repeat(700));

    const m = measureDist(dist, "home");
    expect(m.entry.raw).toBe(readFileSync(join(dist, "assets/index-AAAAAAAA.js")).length);
    expect(m.largestRoute.raw).toBe(5000);
    expect(Object.keys(m.routes).sort()).toEqual(pageNames().sort());
    expect(m.firstLoadFiles).toEqual(["assets/home-HHHHHHHH.js", "assets/index-AAAAAAAA.js", "assets/lib-LLLLLLLL.js", "assets/shared-SSSSSSSS.js"]);
    expect(m.firstLoadJs.raw).toBe(m.entry.raw + 1000 + m.routes.home!.raw + 200);
    expect(m.css.raw).toBe(300);
    expect(m.fontAwesome.raw).toBe(700);
    expect(forbidden(dist)).toEqual([]);
    mkdirSync(join(dist, "fontawesome/source"));
    expect(forbidden(dist)).toHaveLength(1);
  });
});

describe("a page without exactly one chunk", () => {
  function dist(extra: Record<string, string>, omit: string[] = []) {
    const dir = mkdtempSync(join(tmpdir(), "budget-"));
    mkdirSync(join(dir, "assets"));
    writeFileSync(join(dir, "index.html"), '<script type="module" src="/assets/index-AAAAAAAA.js"></script>');
    writeFileSync(join(dir, "assets/index-AAAAAAAA.js"), pageNames().map((n) => `import("./${n}-PPPPPPPP.js");`).join(""));
    for (const page of pageNames().filter((p) => !omit.includes(p))) writeFileSync(join(dir, `assets/${page}-PPPPPPPP.js`), "p");
    for (const [file, text] of Object.entries(extra)) writeFileSync(join(dir, "assets", file), text);
    return dir;
  }

  it("fails, naming the page, when it has no chunk (largestRoute must not pass by skipping it)", () => {
    expect(() => measureDist(dist({}, ["board"]), "home")).toThrow(/page "board" must have exactly one chunk.*found 0/);
  });

  it("ignores a module of the same name that nothing loads with import()", () => {
    expect(measureDist(dist({ "board-QQQQQQQQ.js": "q" }), "home").largestRoute.raw).toBe(1);
  });

  it("fails, naming the chunks, when two are loaded with import()", () => {
    const d = dist({ "board-QQQQQQQQ.js": "q" });
    writeFileSync(join(d, "assets/index-AAAAAAAA.js"), pageNames().map((n) => `import("./${n}-PPPPPPPP.js");`).join("") + 'import("./board-QQQQQQQQ.js");');
    expect(() => measureDist(d, "home")).toThrow(/page "board".*found 2 \(board-PPPPPPPP\.js, board-QQQQQQQQ\.js\)/);
  });

  it("measures when each page has one", () => {
    expect(measureDist(dist({}), "home").largestRoute.raw).toBe(1);
  });
});

describe("the owner's whole Font Awesome files in a static output", () => {
  it("fails for storybook-static as it does for dist, and passes for the subset alone", () => {
    const dir = mkdtempSync(join(tmpdir(), "static-"));
    mkdirSync(join(dir, "fontawesome/js"), { recursive: true });
    writeFileSync(join(dir, "fontawesome/README.md"), "r");
    const guard = () => spawnSync("node", ["scripts/storybook-guard.ts", "--dir", dir], { cwd: process.cwd(), encoding: "utf8" });
    expect(guard().status).toBe(0);
    mkdirSync(join(dir, "fontawesome/vendor"));
    const failed = guard();
    expect(failed.status).toBe(1);
    expect(failed.stderr).toContain("fontawesome/vendor");
  });
});

describe("starknet.js in a mock build (#927)", () => {
  /** A build whose chunks hold `chunks`' code. */
  const build = (chunks: Record<string, string>) => {
    const dir = mkdtempSync(join(tmpdir(), "dist-"));
    mkdirSync(join(dir, "assets"));
    for (const [name, code] of Object.entries(chunks)) writeFileSync(join(dir, "assets", name), code);
    return dir;
  };

  it("fails, naming the chunk, when a mock build carries starknet.js; a chain build carries it freely", () => {
    const dir = build({ "index-a.js": "x", "dist-b.js": `send("${STARKNET_MARK}")` });
    expect(starknetInMock(dir, true)).toEqual(["assets/dist-b.js carries starknet.js in a mock build: the mock fetches nothing outside the app's origin (vite.config.ts)"]);
    expect(starknetInMock(dir, false)).toEqual([]);
  });

  it("takes a build that carries the shim for a mock one, whatever the environment says", () => {
    expect(starknetInMock(build({ "dist-a.js": `throw "${SHIM_MARK}"`, "late-b.js": STARKNET_MARK }), false)).toHaveLength(1);
    expect(starknetInMock(build({ "dist-a.js": `throw "${SHIM_MARK}"` }), false)).toEqual([]);
  });

  it("reads the environment's source as the build does: Sepolia's default and VITE_DATA_SOURCE", () => {
    expect(mockEnv({ VITE_NETWORK: "sepolia" })).toBe(true);
    expect(mockEnv({ VITE_NETWORK: "sepolia", VITE_DATA_SOURCE: "chain" })).toBe(false);
    expect(mockEnv({ VITE_NETWORK: "devnet", VITE_DATA_SOURCE: "mock" })).toBe(true);
    expect(mockEnv({})).toBe(false);
  });
});
