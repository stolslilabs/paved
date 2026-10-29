import { useId } from "react";
import { GameIcon, iconFrame, iconParts, IconShadow, outline, paint, type GameIconProps } from "./game-icon";

/**
 * The looks side by side in Storybook for the owner's pick (issue 844), beside `GameIcon`'s own (`relief`). All keep the thick dark
 * outline and the shadow under the icon; they differ in the fill:
 * - `relief`: a soft vertical gradient (lit top, shaded foot) and a white light along each part's upper edges (`GameIcon`, the HUD's);
 * - `gloss`: a hard two-step fill, the upper half lit and the lower in the body's tone, a light over the upper half;
 * - `toon`: one flat tone per part, cel style.
 * Only the stories import this file, so the app's bundle carries the HUD's look alone; the owner's pick becomes `GameIcon`'s.
 */
export const GAME_LOOKS = ["relief", "gloss", "toon"] as const;
export type GameLook = (typeof GAME_LOOKS)[number];

export function GameIconLook({ look, name, tone, ...frame }: GameIconProps & { look: GameLook }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  if (look === "relief") return <GameIcon name={name} tone={tone} {...frame} />;
  const parts = iconParts(name, tone);
  return (
    <svg {...iconFrame({ name, ...frame })} data-look={look}>
      <defs>
        {[...new Set(parts.map((p) => p.tone))].map((t) => (
          <linearGradient key={t} id={`${id}${t}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: paint(t, "hi") }} />
            <stop offset="0.5" style={{ stopColor: paint(t, "hi") }} />
            <stop offset="0.5" style={{ stopColor: paint(t, "mid") }} />
            <stop offset="1" style={{ stopColor: paint(t, "lo") }} />
          </linearGradient>
        ))}
        <clipPath id={`${id}top`}>
          <rect x="-320" y="-320" width="1280" height="550" />
        </clipPath>
      </defs>
      <IconShadow parts={parts} />
      {parts.map((p, i) => (
        <g key={i}>
          {outline(p)}
          <path d={p.d} style={{ fill: look === "toon" ? paint(p.tone, "mid") : `url(#${id}${p.tone})` }} />
          {look === "gloss" && <path d={p.d} clipPath={`url(#${id}top)`} opacity={0.15} style={{ fill: "var(--game-light)" }} />}
        </g>
      ))}
    </svg>
  );
}
