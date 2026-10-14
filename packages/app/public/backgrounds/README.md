# Backgrounds

Self-hosted images for the scenes' backgrounds (`components/elements/background.tsx`). Nothing is fetched from another host.

## Source

`placeholder-*` come from `app/public/assets/placeholder.png` (2000 x 1000 px, 1,002,100 B as a PNG; no alpha), the placeholder the
owner chose on 2026-10-14. It stands in until the real art lands: replace the source, run the commands again, keep the names.

## Files

| File | Bytes |
|---|---|
| `placeholder-720.avif` | 48,352 |
| `placeholder-720.webp` | 53,400 |
| `placeholder-720.jpg` | 108,791 |
| `placeholder-1440.avif` | 111,633 |
| `placeholder-1440.webp` | 126,638 |
| `placeholder-1440.jpg` | 307,904 |
| `placeholder-2000.avif` | 167,501 |
| `placeholder-2000.webp` | 193,598 |
| `placeholder-2000.jpg` | 543,084 |

720 is a 360 px phone at 2x, 1440 the widest layout at 1x, 2000 its 2x (the source's own width: nothing is upscaled).
A browser takes AVIF, else WebP, else the JPEG fallback (`<picture>`, `srcset` with `sizes="100vw"`).

## Reproduce

Tools: macOS `sips` 316 (macOS 27.0.1, resize, AVIF and JPEG) and `cwebp` 1.6.0 (libwebp). No npm dependency.

```sh
SRC=app/public/assets/placeholder.png   # from the repository root
cd packages/app/public/backgrounds
for w in 720 1440 2000; do
  sips -z $((w/2)) $w "../../../../$SRC" --out /tmp/bg-$w.png
  cwebp -quiet -q 72 -m 6 /tmp/bg-$w.png -o placeholder-$w.webp
  sips -s format avif -s formatOptions 55 /tmp/bg-$w.png --out placeholder-$w.avif
  sips -s format jpeg -s formatOptions 70 /tmp/bg-$w.png --out placeholder-$w.jpg
done
```
