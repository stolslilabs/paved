# PLATES flicker proof (software rendering)

Follow-up to PLATES (P-74, PR #522). **Software rendering only: SwiftShader (software GL), not a GPU.** It shows what the
frames contain, not how a GPU draws them. Script: `scripts/client/flicker-sweep.mjs` (one Chromium, one run per line below).

## Method

Frames are the 300x400 crop of the `Renderer/Placement` story (`in-hand`, top view, distance 240, reduced motion, 360x740
viewport), captured as the sweep moves, two animation frames after each camera step, nothing waited to settle. Luminance is
compared **pixel by pixel**, never as a crop-wide mean, and never after shifting frames to register them (a moving camera makes
a registered comparison measure the registration). Over three consecutive frames A, B, C of a slow sweep:

- **flip**: a pixel that moves by more than T = 24 (of 255) from A to B and back by more than T from B to C. A smooth motion moves
  a pixel one way; a flicker goes up and down.
- **step**: a pixel whose |B - A| is above T. This is the motion itself, the baseline to read flips against.
- **revisit**: the zoom sweep goes in (40 frames, 0.3 % of the distance each) and back out through the same 40 camera poses;
  |in - out| per pixel at the same pose. Anything above 0 is a state the pose does not decide.
- **still**: the same pose drawn 8 times; every frame must equal the first.
- **pan**: 24 steps of a quarter pixel of ground.
- **positive control**: the same sweeps with the bloom strength alternating 0.2 / 1.6 frame by frame (bloom threshold 0: at the
  default 0.9 the plates' scene has nothing to bloom, a first control at the default changed no pixel on the plates build and
  was discarded). The method must count flips there.

## Builds

- **slots**: `e8f52b71`, main before PLATES (the dashed slots).
- **plates**: `ec5916f7`, main with PLATES (and VOXEL-DROP, NIGHT-WINDOWS, which landed after; the "plates, no plate" row is the
  baseline for that difference).

## Results (percent of the crop's pixels, mean over the sweep's frames)

| Build, quality | still flip | pan step / **flip** | zoom step / **flip** (max frame) | revisit differing px |
|---|---|---|---|---|
| slots, High | 0 | 17.91 / 4.53 | 6.35 / 0.582 (1.93) | 0 |
| plates, High | 0 | 13.34 / 2.04 | 3.96 / 0.153 (0.20) | 0 |
| plates, High, no plate drawn (state `idle`) | 0 | 10.31 / 1.83 | 2.55 / 0.140 (0.20) | 0 |
| slots, Medium (no bloom) | 0 | 16.31 / 3.10 | 5.27 / 0.323 (0.50) | 0 |
| plates, Medium (no bloom) | 0 | 13.34 / 2.04 | 3.96 / 0.153 (0.20) | 0 |
| **control** slots, High, bloom alternating | 95.7 | 95.6 / 94.6 | 96.1 / 95.5 | 0 |
| **control** plates, High, bloom alternating | 89.1 | 89.1 / 88.8 | 88.1 / 87.9 | 0 |

(plates High and Medium are identical to the pixel: at the default threshold bloom changes nothing in this scene.)

## What it shows

- The method sees a flicker: the control gives 88 to 96 % flip pixels on both builds, against at most 4.5 % without it.
- Still and revisit are exact zero on both builds: the picture depends on the camera pose alone, not on how it was reached.
- The remaining flips (zoom sweep 0.15 %, pan 2.0 %) are the board's own fine texture (voxel faces, outlines) shifting by
  sub-pixel steps; with no plate drawn they are 0.14 % and 1.8 %. The plates add about 0.01 point on the zoom sweep.
- Against the slots they are lower (zoom 0.15 against 0.58 %, pan 2.0 against 4.5 %): the dashed slot lines shimmered more
  than the solid plates.
- No real flicker was found, so no plate code was changed.

Not covered: a GPU (different rasteriser, MSAA and bloom paths); only one view and one board; the slots/plates builds differ by
two later merges (see above), the idle row bounds that.
