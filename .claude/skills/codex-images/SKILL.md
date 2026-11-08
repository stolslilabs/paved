---
name: codex-images
description: How to generate or redraw the painted art of packages/app (icons, emblems, frames, play art) with the Codex CLI's built-in image tool. Use when a page needs a new painted icon, a mockup crop redrawn clean, or when Codex says it has no image tool.
---

# codex-images

The painted art of `packages/app` (the HUD's icons, emblems, frames, the modes' art) comes from Codex's built-in image tool,
run from the shell with `codex exec`. This skill is how to call it, how to brief it, and how its output enters the app.

## The rules

- **Codex's built-in image tool only** (`image_gen`). No API key, no other image API or service, no image taken from the web.
- **Never edit `~/.codex/config.toml`**, and never read or list `~/.codex`.
- **Add `-c model_provider=openai` to the call.**
  - The configured default provider lists no image tool. Without the override, Codex answers that it has none.
  - With it, on that call only, Codex lists `image_gen` (`image_gen__imagegen`).
- Save every output, early ones included: the owner often prefers the first sheet.

## The command

```sh
codex exec --skip-git-repo-check -s workspace-write -C <dir> -c model_provider=openai -i <ref1.png> -i <ref2.png> < prompt.txt
```

- **`<dir>`** is a folder of your session's scratchpad. Codex writes only there.
- **The prompt goes on stdin** (`< prompt.txt`) or after `--`: `-i` swallows a prompt that follows it.
- **References are PNG or JPEG.** Convert a WebP master first: `dwebp in.webp -o in.png`.
- **To correct a run** without starting over, resume it: `codex exec resume <id> -c model_provider=openai`.
- **Runs can go in parallel**, one object per run.

## The prompt

- **Name the tool:** "Use your built-in image generation/editing tool (image_gen) only. Do not call any other image API."
- **Paths:** give every path absolute.
- **The output:**
  - Say what each input is: the mockup's crop, the style references.
  - Describe the one object to draw, and what to leave out.
  - Ask for "alone on a fully transparent background, a square RGBA PNG of at least 1024 px, centred, filling about 90%".
  - Ask for 2 or 3 variants (separate generations).
  - Have Codex `cp` each variant from where the tool saved it into `<dir>`, under names you set (`<name>-v1.png`…), and write
    nothing else outside `<dir>`.
- **A self-check:** you may ask Codex to check each result with a short Python script: RGBA, transparent corners, and the
  drawing as one connected region.

## The style

- **References.** Pass 3 or 4 shipped masters from `packages/app/ui-sources/<kind>/` as style references, plus the mockup's
  crop when there is one (the Paved UX Book's painted assets win).
- **One object per run.** When an approved image is close, edit from it rather than drawing from nothing.
- **A whole set** goes at its final count in one batch.
- **Compare the variants** beside the shipped icons at 128, 32 and 24 px, on the drawer's charcoal and on a light ground. Zoom
  in to check counts and small parts.
- **Transparency.**
  - Paint on transparent.
  - For a light or a glow, paint on pure black, then take the alpha from the brightest channel.
  - Avoid magenta keying, which leaves holes. If you must key, key every near-magenta pixel.
  - A redraw is sharper than a pixel cut from the mockup.

## Into the app

1. **Fit to the module's frame.** For the icons, trim to the alpha box, then fit the drawing to 240 px on a 256 px square,
   with a premultiplied downscale. Another module has its own frame constant; read it in that module.
2. **Save the master** as lossless WebP: `cwebp -lossless -z 9 -exact in.png -o <name>.webp`.
3. **Put the master in `packages/app/ui-sources/<kind>/`** and its name in the art module: `UI_ICONS` in
   `src/components/elements/ui-art.ts`, or the page's own (`play-art.ts`, `ranking-art.ts`, `emblem-art.ts`…). Masters are
   never shipped.
4. **From `packages/app`, run `node scripts/compress-ui-art.ts`, then `node scripts/compress-ui-art.ts --check`.** They write
   and check the copies in `public/ui-art/`.
5. **Budget.** Never change the look to save bytes. If a limit is exceeded (the HUD art total in `__tests__/ui-art.test.tsx`,
   `scripts/bundle-budget.json`), raise only that limit, by the measured growth, and say so in the PR.
6. **In the PR**, name the tool, the references and the variants drawn, and say which variant was kept and why.
