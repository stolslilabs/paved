import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { forbidden, htmlAssets, measureDist, METRICS, overBudget, pageNames, readBudget, staticImports, type Sizes } from "../scripts/bundle-budget";

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
    put("assets/index-AAAAAAAA.js", 'import"./shared-SSSSSSSS.js";const p=import("./home-HHHHHHHH.js");const q=import("./board-BBBBBBBB.js");');
    put("assets/shared-SSSSSSSS.js", "x".repeat(1000));
    put("assets/home-HHHHHHHH.js", 'import{a}from"./lib-LLLLLLLL.js";' + "h".repeat(500));
    put("assets/lib-LLLLLLLL.js", "l".repeat(200));
    put("assets/board-BBBBBBBB.js", "b".repeat(5000));
    put("assets/index-CCCCCCCC.css", "c".repeat(300));
    put("fontawesome/js/solid.min.js", "s".repeat(700));

    const m = measureDist(dist, "home");
    expect(m.entry.raw).toBe(readFileSync(join(dist, "assets/index-AAAAAAAA.js")).length);
    expect(m.largestRoute.raw).toBe(5000);
    expect(m.firstLoadFiles).toEqual(["assets/home-HHHHHHHH.js", "assets/index-AAAAAAAA.js", "assets/lib-LLLLLLLL.js", "assets/shared-SSSSSSSS.js"]);
    expect(m.firstLoadJs.raw).toBe(m.entry.raw + 1000 + m.routes.home!.raw + 200);
    expect(m.css.raw).toBe(300);
    expect(m.fontAwesome.raw).toBe(700);
    expect(forbidden(dist)).toEqual([]);
    mkdirSync(join(dist, "fontawesome/source"));
    expect(forbidden(dist)).toHaveLength(1);
  });
});
