# PLATES flicker proof (software rendering)

Follow-up to PLATES (P-74, PR #522). **Software rendering only: SwiftShader (software GL), not a GPU.** It shows what the
frames contain, not how a GPU draws them. Script: `scripts/client/flicker-sweep.mjs` (one Chromium, one run per line below).

## Method

Frames are the 300x400 crop of the `Renderer/Placement` story (`in-hand`, top view, distance 240, reduced motion, 360x740
viewport), captured as the sweep moves, two animation frames after each camera step, nothing waited to settle. Luminance is
compared **pixel by pixel** (absolute differences, never a crop-wide mean).

- **Registered residual (the main measure, pan and zoom).** Each frame B is sampled (bilinear) where the camera projection puts
  every pixel of the previous frame A, then |B' - A| is taken per pixel. The registration is the projection's own (a ground
  point's move for the pan, the scale about that point for the zoom, read from `camera.project`, camera zoom included); nothing
  is fitted to the frames. A moving, well-drawn scene leaves a small residual (resampling, parallax of the voxels' height); a
  flicker adds to it. It is read against the baseline of the same motion with no plate drawn, and against the control.
  Reported: mean, p99 of the pixels, and the share above T = 24 (of 255).
- **Unregistered flips (supplementary).** A pixel that moves by more than T from A to B and back by more than T from B to C.
  Counted at the same screen index, so they include the motion itself; kept as a cross-check, not as the proof.
- **revisit**: the zoom sweep goes in (40 frames, 0.3 % of the distance each) and back out through the same 40 poses; |in - out|
  per pixel at the same pose, no registration needed. Anything above 0 is a state the pose does not decide.
- **still**: the same pose drawn 8 times; every frame must equal the first.
- **pan**: 24 steps of exactly 2 screen pixels of ground (the step is the projection's, measured per frame: `step_px_max` 2).
  An earlier version stepped by a formula that left out the camera's zoom (5) and moved 1.25 px for a "quarter pixel";
  it is replaced.
- **zoom**: 40 steps of 0.3 % of the distance (a scale of 1.003 per step, about 0.16 px at the crop's far corner).
- **positive control**: the same sweeps with the bloom strength alternating 0.2 / 1.6 frame by frame (bloom threshold 0: at the
  default 0.9 the plates' scene has nothing to bloom, and a first control at the default changed no pixel on the plates build).

## Builds

- **slots**: `e8f52b71`, main before PLATES (the dashed slots).
- **plates**: `ec5916f7`, main with PLATES (and VOXEL-DROP, NIGHT-WINDOWS, which landed after; the "no plate drawn" row is the
  baseline for that difference).

## Results

Registered residual, mean luminance step per pixel (0..255) / p99 / share above T (%), mean over the sweep's frames:

| Build, quality | still flips | pan 2 px, registered | zoom 0.3 %, registered (worst frame mean) | revisit differing px |
|---|---|---|---|---|
| slots, High | 0 | 1.07 / 11.0 / 0.070 | 6.53 / 38.6 / 4.11 (10.48) | 0 |
| plates, High | 0 | 1.24 / 12.5 / 0.108 | 3.85 / 28.9 / 1.66 (4.11) | 0 |
| plates, High, no plate drawn (`idle`) | 0 | 1.06 / 12.1 / 0.084 | 3.19 / 24.9 / 1.13 (3.35) | 0 |
| slots, Medium (no bloom) | 0 | 1.10 / 12.2 / 0.112 | 4.46 / 33.5 / 2.57 (4.82) | 0 |
| plates, Medium (no bloom) | 0 | 1.24 / 12.5 / 0.108 | 3.85 / 28.9 / 1.66 (4.11) | 0 |
| **control** slots, High, bloom alternating | 95.7 | 78.6 / 105.8 / 95.9 | 78.3 / 103.8 / 96.4 | 0 |
| **control** plates, High, bloom alternating | 89.1 | 68.3 / 103.2 / 89.0 | 69.0 / 100.9 / 88.0 | 0 |

Unregistered, for comparison (same runs): the pan's mean |B - A| is 13.8 (plates) against a registered 1.24; unregistered flips
are 4.6 % (plates), 4.5 % (slots), 3.6 % (no plate) on the pan and 0.18 %, 0.55 %, 0.16 % on the zoom.

(Plates High and Medium are identical to the pixel: at the default threshold bloom changes nothing in this scene.)

## What it shows

- The method sees a flicker: the control leaves a residual of 68 to 79 and 88 to 96 % of pixels above T, against 1.2 to 6.5 and
  at most 4.1 % without it, on both builds.
- Still and revisit are exact zero on both builds: the picture depends on the camera pose alone, not on how it was reached.
- Pan: registered, the plates leave 1.24 against 1.06 with no plate drawn (+0.18, +0.02 point above T) and 1.07 for the slots.
- Zoom: the registered residual is not zero for any build, since bilinear resampling of edges at a 1.003 scale is not exact;
  it is the floor the rest is read against. The plates add 0.66 to the no-plate floor (their edges are more content to
  resample), and stay well under the slots' 6.53 (worst frame 4.11 against 10.48). No frame stands out from its neighbours in
  the plates' sweep.
- The plates' sweep does not show a flicker: nothing is above the baseline the same motion gives, by a margin that the control
  (two orders larger) would show. No plate code was changed.

Not covered: a GPU (different rasteriser, MSAA and bloom paths); one view and one board; the zoom registration cannot tell a
sub-1-level shimmer from resampling error; the slots and plates builds differ by two later merges (the "no plate" row bounds that).
