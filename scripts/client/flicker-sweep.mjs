#!/usr/bin/env node
// Software flicker proof of the placement plates (PLATES, P-74): still, pan and zoom sweep, per pixel.
//
// STATE=idle draws the board with no plate (the baseline of the motion itself).
//   node scripts/client/flicker-sweep.mjs <storybook-static dir> <label> <story: plates|slots> [quality=high] [control=none|bloom]
//
// Serves a built Storybook (`bun run build-storybook`, packages/app), opens the PlacementBoard story "in-hand" (the plates
// of a tile in hand) in SwiftShader (software GL: not a GPU), and prints one JSON line.
//
// The method needs no registration of frames (a moving camera makes a crop-wide mean, or a shifted comparison, measure the
// motion). It counts PIXELS, one by one, over three consecutive frames A, B, C of a slow sweep (a step is under one pixel at
// most places):
//   flip   a pixel that moves by more than T (luminance, 0..255) from A to B and back by more than T from B to C (opposite
//          signs): it flickers. A smooth motion moves a pixel one way.
//   step   the same pixel's |B - A| above T: how many pixels the motion itself changes (the baseline to read flips against).
// and, on the way back, at the same camera poses as on the way in:
//   revisit  |in - back| per pixel at the same pose, no registration: any non-zero is a state the pose does not decide.
// A still camera is drawn 8 times (every frame must equal the first: zero). The positive control (control=bloom) alternates
// the bloom strength between two values frame by frame (threshold 0: the default 0.9 leaves the plates' scene nothing to bloom), in the same sweep: the method must count flips there.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createRequire } from "node:module";

const [, , dir, label = "build", story = "plates", quality = "high", control = "none"] = process.argv;
if (!dir) throw new Error("usage: flicker-sweep.mjs <storybook-static dir> <label> <story> [quality] [control]");
const require = createRequire(new URL("../../packages/app/package.json", import.meta.url));
const { chromium } = require("playwright-core");

const T = 24;
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp", ".png": "image/png", ".wasm": "application/wasm", ".glb": "model/gltf-binary", ".bin": "application/octet-stream" };
const server = createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^(\.\.[/\\])+/, "");
  try {
    res.setHeader("content-type", TYPES[extname(path)] ?? "application/octet-stream");
    res.end(await readFile(join(dir, path)));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1 });
const args = `state:${process.env.STATE ?? "in-hand"};force:on;view:top;distance:240;reducedMotion:!true;quality:${quality};readout:!false`;
await page.goto(`${base}/iframe.html?id=renderer-placement--${story}&viewMode=story&args=${args}`);
await page.waitForFunction(() => window.__placementScene, null, { timeout: 90000 });
await page.waitForTimeout(3000);

const CLIP = { x: 30, y: 170, width: 300, height: 400 };
// Luminance of the crop, from a screenshot (the canvas as the page shows it, post-processing included).
await page.evaluate(() => {
  window.__lum = async (url) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height).data;
    const out = new Float32Array(c.width * c.height);
    for (let i = 0; i < out.length; i++) out[i] = 0.2126 * d[i * 4] + 0.7152 * d[i * 4 + 1] + 0.0722 * d[i * 4 + 2];
    return out;
  };
  window.__frames = [];
});
const grab = async (keep = "frames") => {
  const buf = await page.screenshot({ clip: CLIP, timeout: 180000 });
  await page.evaluate(async ([u, k]) => (window[k] ??= []).push(await window.__lum(u)), ["data:image/png;base64," + buf.toString("base64"), keep]);
};
const reset = (k) => page.evaluate((k) => (window[k] = []), k);

// One camera step; the bloom control alternates the strength each frame. Then two animation frames: the frame is drawn.
const step = (kind, k, i) =>
  page.evaluate(
    async ([kind, k, i, control]) => {
      const s = window.__placementScene, c = s.controls.controls, cam = s.camera;
      // Where a ground point (the sweep's first target, and one 10 units to its side) is on screen, in the crop's pixels.
      const proj = (v) => {
        cam.updateMatrixWorld();
        cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
        const q = v.clone().project(cam);
        return [((q.x + 1) / 2) * innerWidth - 30, ((1 - q.y) / 2) * innerHeight - 170];
      };
      const P0 = (window.__P0 ??= c.target.clone()), P1 = (window.__P1 ??= c.target.clone().add({ x: 10, y: 0, z: 0 }));
      const before = [proj(P0), proj(P1)];
      if (kind === "pan") {
        // k is in screen pixels: the pixels per world unit come from the projection itself (the camera's zoom included).
        cam.lookAt(c.target);
        const here = proj(c.target), next = c.target.clone().add({ x: 1, y: 0, z: 0 });
        const ppu = Math.abs(proj(next)[0] - here[0]);
        const w = k / ppu;
        cam.position.x += w;
        c.target.x += w;
      } else if (kind === "zoom") cam.position.sub(c.target).multiplyScalar(1 + k).add(c.target);
      cam.lookAt(c.target);
      c.update?.();
      if (control === "bloom") {
        const b = s.effects.bloomPass;
        if (b) { b.threshold = 0; b.strength = i % 2 ? 1.6 : 0.2; }
      }
      s.requestRender();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (kind) {
        // The registration of this frame onto the previous one: the ground point's move and the zoom about it, from the projection.
        const after = [proj(P0), proj(P1)];
        const len = (a) => Math.hypot(a[1][0] - a[0][0], a[1][1] - a[0][1]);
        (window.__regs ??= []).push({ s: len(after) / len(before), tx: after[0][0] - before[0][0], ty: after[0][1] - before[0][1], cx: before[0][0], cy: before[0][1] });
      }
    },
    [kind, k, i, control],
  );
const poseOf = () => page.evaluate(() => { const s = window.__placementScene; return { p: s.camera.position.toArray(), t: s.controls.controls.target.toArray() }; });
const setPose = (q, i) =>
  page.evaluate(async ([q, i, control]) => {
    const s = window.__placementScene, c = s.controls.controls;
    s.camera.position.fromArray(q.p);
    c.target.fromArray(q.t);
    s.camera.lookAt(c.target);
    c.update?.();
    if (control === "bloom" && s.effects.bloomPass) { s.effects.bloomPass.threshold = 0; s.effects.bloomPass.strength = i % 2 ? 1.6 : 0.2; }
    s.requestRender();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, [q, i, control]);

// The per-pixel counts of the frames kept under `key`, as a share of the crop's pixels.
const analyse = (key) =>
  page.evaluate(([key, T]) => {
    const f = window[key];
    const n = f[0].length;
    let stepPx = 0, flipPx = 0, stepMax = 0, flipMax = 0, sum = 0, triples = 0, pairs = 0;
    for (let a = 0; a + 1 < f.length; a++) {
      let st = 0;
      for (let i = 0; i < n; i++) { const d = Math.abs(f[a + 1][i] - f[a][i]); sum += d; if (d > T) st++; }
      stepPx += st; stepMax = Math.max(stepMax, st); pairs++;
    }
    for (let a = 0; a + 2 < f.length; a++) {
      let fl = 0;
      for (let i = 0; i < n; i++) { const u = f[a + 1][i] - f[a][i], v = f[a + 2][i] - f[a + 1][i]; if (u * v < 0 && Math.abs(u) > T && Math.abs(v) > T) fl++; }
      flipPx += fl; flipMax = Math.max(flipMax, fl); triples++;
    }
    const pct = (x, m) => +((x / m / n) * 100).toFixed(4);
    return { frames: f.length, step_pct_mean: pct(stepPx, pairs), step_pct_max: pct(stepMax, 1), flip_pct_mean: pct(flipPx, Math.max(1, triples)), flip_pct_max: pct(flipMax, 1), flip_px_total: flipPx, absdiff_mean: +(sum / pairs / n).toFixed(4) };
  }, [key, T]);

// Registered residual: frame B is sampled (bilinear) where the projection puts each pixel of frame A, then |B' - A| per pixel.
// The registration is the projection's (a move of the ground point, a scale about it), nothing is fitted to the frames.
const analyseReg = (key) =>
  page.evaluate(([key, T, W, H]) => {
    const f = window[key], regs = window.__regs.splice(0);
    let sum = 0, over = 0, cnt = 0, maxPx = 0, p99s = 0, shiftMax = 0, scaleMax = 0, perFrameMax = 0;
    for (let a = 0; a + 1 < f.length; a++) {
      const A = f[a], B = f[a + 1], r = regs[a];
      shiftMax = Math.max(shiftMax, Math.hypot(r.tx, r.ty));
      scaleMax = Math.max(scaleMax, Math.abs(r.s - 1));
      const hist = new Uint32Array(256);
      let fs = 0, fc = 0;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          // A(x) = B(c + (x - c) * s + t) with c the ground point's place in frame A (the zoom's centre)... the move t is the point's move
          const bx = r.cx + (x - r.cx) * r.s + r.tx, by = r.cy + (y - r.cy) * r.s + r.ty;
          const x0 = Math.floor(bx), y0 = Math.floor(by);
          if (x0 < 0 || y0 < 0 || x0 + 1 >= W || y0 + 1 >= H) continue;
          const fx = bx - x0, fy = by - y0;
          const v = B[y0 * W + x0] * (1 - fx) * (1 - fy) + B[y0 * W + x0 + 1] * fx * (1 - fy) + B[(y0 + 1) * W + x0] * (1 - fx) * fy + B[(y0 + 1) * W + x0 + 1] * fx * fy;
          const d = Math.abs(v - A[y * W + x]);
          fs += d; fc++; if (d > T) over++; if (d > maxPx) maxPx = d; hist[Math.min(255, Math.round(d))]++;
        }
      let acc = 0, q = 0;
      for (; q < 256; q++) { acc += hist[q]; if (acc >= 0.99 * fc) break; }
      sum += fs; cnt += fc; p99s += q;
      perFrameMax = Math.max(perFrameMax, fs / fc);
    }
    const nf = f.length - 1;
    return { frames: nf, step_px_max: +shiftMax.toFixed(3), scale_step_max: +scaleMax.toFixed(5), reg_absdiff_mean: +(sum / cnt).toFixed(4), reg_absdiff_max_frame_mean: +perFrameMax.toFixed(4), reg_p99_mean: +(p99s / nf).toFixed(2), reg_over_T_pct: +((over / cnt) * 100).toFixed(4), reg_max_px: +maxPx.toFixed(1) };
  }, [key, T, CLIP.width, CLIP.height]);

const out = { label, quality, control, renderer: "SwiftShader (software GL, not a GPU)", T, crop: `${CLIP.width}x${CLIP.height}` };

// Still: the same pose drawn 8 times.
await reset("still");
await page.evaluate(() => window.__placementScene.requestRender());
for (let i = 0; i < 8; i++) { await step(null, 0, i); await grab("still"); }
out.still = await analyse("still");

// Pan: 2 pixels of ground per step (the projection gives the pixels per world unit, camera zoom included), 24 steps, drawn without waiting for anything to settle.
await reset("pan");
await grab("pan");
await page.evaluate(() => (window.__regs = []));
for (let i = 0; i < 24; i++) { await step("pan", 2, i); await grab("pan"); }
out.pan = await analyse("pan");
out.pan_registered = await analyseReg("pan");

// Zoom sweep in (0.3% of the distance per step, 40 frames), then out along the same poses; the revisit compares the frames
// of the two ways at the same pose.
const poses = [await poseOf()];
await reset("zin");
await grab("zin");
await page.evaluate(() => (window.__regs = []));
for (let i = 0; i < 40; i++) { await step("zoom", -0.003, i); poses.push(await poseOf()); await grab("zin"); }
out.zoom_in = await analyse("zin");
out.zoom_registered = await analyseReg("zin");
await reset("zout");
for (let i = 39; i >= 0; i--) { await setPose(poses[i], 39 - i); await grab("zout"); }
out.zoom_revisit = await page.evaluate(([T]) => {
  const a = window.zin, b = window.zout; // b[j] is the pose 39 - j of the way in: a[39 - j]
  let mean = 0, maxPx = 0, nz = 0, hi = 0, hiMax = 0;
  const n = a[0].length;
  for (let j = 0; j < b.length; j++) {
    const x = a[39 - j], y = b[j];
    let s = 0, h = 0;
    for (let i = 0; i < n; i++) { const d = Math.abs(x[i] - y[i]); s += d; if (d > T) h++; if (d > maxPx) maxPx = d; if (d > 0) nz++; }
    mean += s / n; hi += h; hiMax = Math.max(hiMax, h);
  }
  return { poses: b.length, absdiff_mean: +(mean / b.length).toFixed(4), absdiff_max_px: +maxPx.toFixed(2), differing_px_total: nz, over_T_pct_mean: +((hi / b.length / n) * 100).toFixed(4), over_T_pct_max: +((hiMax / n) * 100).toFixed(4) };
}, [T]);

console.log(JSON.stringify(out));
await browser.close();
server.close();
