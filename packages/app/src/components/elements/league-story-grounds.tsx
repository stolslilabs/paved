import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

/**
 * The grounds the league standards' stories (issue 917) set them on: the app's page and a card (the dark theme), a light ground (the
 * relief's light, for a light surface), and the summer sky by day and by night (the home's). Stories only.
 */
export const GROUNDS = [
  { name: "Page", className: "bg-background text-foreground" },
  { name: "Card", className: "bg-card text-card-foreground" },
  { name: "Light", className: "text-background", style: { background: "var(--game-light)" } },
  { name: "Summer day sky", className: "text-foreground", style: { background: "linear-gradient(to bottom, var(--sky-summer-day-top), var(--sky-summer-day-bottom))" } },
  { name: "Summer night sky", className: "text-foreground", style: { background: "linear-gradient(to bottom, var(--sky-summer-night-top), var(--sky-summer-night-bottom))" } },
] as const;

/** Each ground in its own panel, titled, with `children` on it. */
export function Grounds({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      {GROUNDS.map((g) => (
        <section key={g.name} aria-label={g.name} className={cn("flex flex-col gap-3 rounded-xl p-4", g.className)} style={"style" in g ? g.style : undefined}>
          <h3 className="m-0 text-sm font-semibold">{g.name}</h3>
          {children}
        </section>
      ))}
    </div>
  );
}

const STONE = "color-mix(in oklab, var(--game-stone) 55%, var(--game-wood))";
const FAR = "color-mix(in oklab, var(--game-stone) 60%, var(--game-blue))";

/** A tower with its battlements, its foot on the ground line. */
const tower = (x: number, w: number, h: number) => {
  const m = w / 5;
  let d = `M${x} 400V${400 - h - m}`;
  for (let i = 0; i < 5; i += 1) d += `h${m}${i < 4 ? `v${i % 2 ? -m : m}` : ""}`;
  return `${d}V400z`;
};

/**
 * The design's ground, drawn for the stories (the design's painting is not shipped): a summer sky, a castle's towers far and near
 * with their red hangings, a green ground. Full-bleed behind `children`. Inline styles where a class would be new to the stylesheet.
 */
export function CastleBackdrop({ children, className }: { children: ReactNode; className?: string }) {
  const far = [40, 210, 520, 760, 1010, 1260].map((x, i) => ({ x, w: 90 + (i % 3) * 20, h: 230 + (i % 2) * 50 }));
  const near = [120, 380, 660, 900, 1150].map((x, i) => ({ x, w: 120, h: 180 + (i % 2) * 40 }));
  return (
    <div className={cn("relative overflow-hidden rounded-xl", className)} style={{ zIndex: 0 }}>
      <svg aria-hidden className="absolute inset-0 size-full" style={{ zIndex: -1 }} viewBox="0 0 1400 600" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id="castle-sky" x2="0" y2="1">
            <stop style={{ stopColor: "var(--sky-summer-day-top)" }} />
            <stop offset="1" style={{ stopColor: "var(--sky-summer-day-bottom)" }} />
          </linearGradient>
        </defs>
        <rect width="1400" height="600" fill="url(#castle-sky)" />
        <g opacity={0.55} style={{ fill: FAR }}>
          <path d="M0 400V250H1400V400z" />
          {far.map((t) => (
            <path key={t.x} d={tower(t.x, t.w, t.h)} />
          ))}
        </g>
        <g style={{ fill: STONE }} opacity={0.8}>
          <path d="M0 420V300H1400V420z" />
          {near.map((t) => (
            <path key={t.x} d={tower(t.x, t.w, t.h + 60)} transform="translate(0 40)" />
          ))}
        </g>
        <g style={{ fill: "color-mix(in oklab, var(--game-red) 70%, var(--game-ink))" }} opacity={0.8}>
          {near.map((t) => (
            <path key={t.x} d={`M${t.x + 40} ${300 - t.h}h40v90l-20 -14l-20 14z`} />
          ))}
        </g>
        <path d="M0 600V430C300 400 500 450 700 430S1100 400 1400 430V600z" style={{ fill: "color-mix(in oklab, var(--game-green) 45%, var(--game-ink))" }} />
      </svg>
      <div className="absolute inset-0 bg-background" style={{ zIndex: -1, opacity: 0.25 }} />
      {children}
    </div>
  );
}
