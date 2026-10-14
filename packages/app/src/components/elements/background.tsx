import { cn } from "../../lib/utils";

/** The widths `public/backgrounds` holds (see its README): 1x and 2x of the widest the image is drawn at, and a phone's. */
const WIDTHS = [720, 1440, 2000] as const;

const srcSet = (name: string, ext: string, base: string) => WIDTHS.map((w) => `${base}backgrounds/${name}-${w}.${ext} ${w}w`).join(", ");

export interface BackgroundProps {
  /** The file stem in `public/backgrounds`: `placeholder` until the real art lands. */
  name?: string;
  /** Where the app is served from (`import.meta.env.BASE_URL`): the files are self-hosted, never fetched from another host. */
  base?: string;
  className?: string;
}

/**
 * A full-bleed background image, decorative: AVIF, then WebP, then JPEG through `<picture>`, each in three widths. It
 * fills its positioned parent; a scrim keeps the text above it readable.
 */
export function Background({ name = "placeholder", base = import.meta.env.BASE_URL, className }: BackgroundProps) {
  const sizes = "100vw";
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} data-slot="background">
      <picture>
        <source type="image/avif" srcSet={srcSet(name, "avif", base)} sizes={sizes} />
        <source type="image/webp" srcSet={srcSet(name, "webp", base)} sizes={sizes} />
        <img
          src={`${base}backgrounds/${name}-1440.jpg`}
          srcSet={srcSet(name, "jpg", base)}
          sizes={sizes}
          alt=""
          decoding="async"
          className="size-full object-cover"
        />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
    </div>
  );
}
