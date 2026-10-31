# Season wheel art

The painted layers of the season dial (`components/elements/season-wheel.tsx`). Self-hosted, imported by the component, so
Vite fingerprints them in the dial's own lazy chunk. Nothing is fetched from another host.

## Source

Art direction and images by Codex CLI 0.163.0 (its built-in image generation), driven from Claude Code on 2026-10-31.
The owner chose each step: a paving-stone border with gold ornaments, from their own example, then one continuous
little-planet landscape for the seasons, without separators. The layers were cut from the generated images with exact
masks in Python (Pillow, NumPy) and exported with `cwebp` 1.6.0 at quality 90. The generated sources, the 1024 px
lossless masters and the build scripts are not in the repository.

## Layers

Every full-dial layer is a 512 x 512 canvas with the dial centred, so the component stacks them with `inset: 0`. Geometry
in a 100-unit box, angles clockwise from 12 o'clock in the unturned file.

| File | Moves | What | Bytes |
|---|---|---|---|
| `season-ring.webp` | counterclockwise, one turn a year | the little planet, its ground at the inner edge, its sky outwards: summer 0-90, autumn 90-180, winter 180-270, spring 270-360, smooth transitions at each start; shows from r 20.5 to 40 (painted 17 to 42.5) | 53,988 |
| `time-disc.webp` | clockwise, one turn a season | the painted sky: night 0-135, day 135-360, 25° glows on each side of dawn (0) and dusk (135); shows to r 16.5 (painted 18.5) | 7,652 |
| `icon-sun.webp`, `icon-moon.webp` | ride on the time disc, kept upright | 128 x 128 sprites, 10 units wide, at r 9.5: the sun at 247.5, the moon at 67.5 | 6,210, 4,290 |
| `shade.webp` | fixed | the soft shadow under both gold rings | 8,998 |
| `inner-bezel.webp` | fixed | the gold ring between the discs, r 16.5 to 20.5 | 8,750 |
| `frame.webp` | fixed | the paving stones and their gold ornaments, r 40 to 50 | 33,182 |
| `pointer.webp` | fixed | the studded gold triangle at 12 o'clock (tip at r 32) and the inner notch (tip at r 13) | 13,108 |
| `hub.webp` | fixed | the gold cap with its bronze stud, r 4 | 1,954 |

Total 138,132 bytes. Only the two discs turn; their light is radial (the landscape's from its own sky), so it holds at any
angle. The fixed layers carry the light from the top left; the sun and the moon stay upright, so theirs stays put too. The
time disc is painted to turn clockwise, against the ring; turning with it, the component mirrors it.
