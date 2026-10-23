import type { Avatar, AvatarStyle } from "@paved/renderer";
import { AvatarStill } from "../../components/elements/avatar-still";
import { XpRing, type PlayerProgress } from "../../components/elements/xp-ring";

/**
 * The avatar's look in Storybook (AVATAR-LOOK, #626 PR 1): a still image as the menus would show it, the same inside #625's XP
 * ring, and the creator's turning 3D preview. Stories only: nothing in the app imports this folder. The still and the preview
 * are the app's (`elements/avatar-still.tsx`, `elements/avatar-preview.tsx`, the creator of #626 PR 2).
 */
export { AvatarStill, useAvatarRender, type AvatarStillProps } from "../../components/elements/avatar-still";
export { AvatarPreview3D, type AvatarPreview3DProps } from "../../components/elements/avatar-preview";

/**
 * The avatar inside #625's XP ring: the ring's band around the circle, as `PlayerAvatar` draws it (2 px at 40, scaled with the
 * disc above it). 40 and 64 use the menus' ring (scaled at 64), 128 the profile sheet's, scaled.
 */
const RING_BOX = {
  40: { box: 44, ring: "md" },
  64: { box: 70, ring: "md" },
  128: { box: 140, ring: "lg" },
} as const;
export type RingSize = keyof typeof RING_BOX;
export const RING_SIZES: RingSize[] = [40, 64, 128];

export function RingedAvatar({ avatar, size, progress, style }: { avatar: Avatar; size: RingSize; progress: PlayerProgress | undefined; style?: AvatarStyle }) {
  const { box, ring } = RING_BOX[size];
  return (
    <span data-slot="ringed-avatar" className="relative grid shrink-0 place-items-center rounded-full" style={{ width: box, height: box }}>
      <AvatarStill avatar={avatar} size={size} style={style} />
      <XpRing progress={progress} size={ring} />
    </span>
  );
}

/** The avatar every sheet starts from: one part changes, the others stay. */
export const SHEET_BASE: Avatar = { skin: 1, hairColour: 2, eyes: 0, eyebrows: 1, mouth: 0, hair: 0, beard: 0, headwear: 0, accessory: 0, background: 0 };

/** The part names as the sheets title them: the creator's tabs' (`containers/avatar-types.ts`). */
export { PART_TITLES } from "../../components/containers/avatar-types";
