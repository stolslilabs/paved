import { useEffect, useRef, useState, type CSSProperties } from "react";
import { loadAvatarRender, type Avatar, type AvatarPart, type AvatarStyle } from "@paved/renderer";
import { XpRing, type PlayerProgress } from "../../components/elements/xp-ring";
import { cn } from "../../lib/utils";

/**
 * The avatar's look in Storybook (AVATAR-LOOK, #626 PR 1): a still image as the menus would show it, the same inside #625's XP
 * ring, and the creator's turning 3D preview. Stories only: nothing in the app imports this folder; the creator page (PR 2)
 * takes what the owner validates here.
 */
type RenderModule = Awaited<ReturnType<typeof loadAvatarRender>>;

let loaded: RenderModule | null = null;

/** The avatar's rendering chunk, once loaded (null until then). */
export function useAvatarRender(): RenderModule | null {
  const [mod, setMod] = useState(loaded);
  useEffect(() => {
    if (mod) return;
    let live = true;
    void loadAvatarRender().then((m) => {
      loaded = m;
      if (live) setMod(m);
    });
    return () => {
      live = false;
    };
  }, [mod]);
  return mod;
}

export interface AvatarStillProps {
  avatar: Avatar;
  /** CSS px: 40, 64 or 128 in the menus. */
  size: number;
  style?: AvatarStyle;
  /** The background behind the head (on by default). */
  background?: boolean;
  className?: string;
}

/** The avatar's still image in its circle: rendered once by the page's one still renderer, then from its cache. */
export function AvatarStill({ avatar, size, style = "voxel", background = true, className }: AvatarStillProps) {
  const mod = useAvatarRender();
  const options = { size, style, background };
  const [src, setSrc] = useState(() => mod?.avatarStills.peek(avatar, options));
  useEffect(() => {
    if (mod) setSrc(mod.avatarStills.get(avatar, { size, style, background }));
  }, [mod, avatar, size, style, background]);
  return (
    <span data-slot="avatar-still" className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)} style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} className="block size-full" draggable={false} />}
    </span>
  );
}

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

export interface AvatarPreview3DProps {
  avatar: Avatar;
  style?: AvatarStyle;
  autoTurn?: boolean;
  /** The square's side in CSS px. */
  size?: number;
  /** Frames drawn and draws, for a readout. */
  onStats?: (stats: { frames: number; draws: number }) => void;
  className?: string;
}

/** The creator's live preview: one WebGL canvas on the avatar's background; drag to turn it. */
export function AvatarPreview3D({ avatar, style = "voxel", autoTurn = true, size = 280, onStats, className }: AvatarPreview3DProps) {
  const mod = useAvatarRender();
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<InstanceType<RenderModule["AvatarPreview"]> | null>(null);
  const first = useRef({ avatar, style, autoTurn });
  first.current = { avatar, style, autoTurn };

  useEffect(() => {
    if (!mod || !host.current) return;
    const p = new mod.AvatarPreview(host.current, first.current.avatar, { style: first.current.style, autoTurn: first.current.autoTurn });
    preview.current = p;
    return () => {
      p.dispose();
      preview.current = null;
    };
  }, [mod]);
  useEffect(() => preview.current?.setAvatar(avatar), [avatar]);
  useEffect(() => preview.current?.setStyle(style), [style]);
  useEffect(() => preview.current?.setAutoTurn(autoTurn), [autoTurn]);
  useEffect(() => {
    if (!onStats) return;
    const timer = setInterval(() => preview.current && onStats({ frames: preview.current.frames, draws: preview.current.draws }), 500);
    return () => clearInterval(timer);
  }, [onStats]);

  const backdrop: CSSProperties | undefined = mod ? { backgroundImage: `url(${mod.backgroundUrl(avatar.background, 64)})`, backgroundSize: "cover", imageRendering: "pixelated" } : undefined;
  return <div ref={host} data-slot="avatar-preview" aria-label="Avatar preview: drag to turn" role="img" className={cn("overflow-hidden rounded-full bg-muted", className)} style={{ width: size, height: size, ...backdrop }} />;
}

/** The avatar every sheet starts from: one part changes, the others stay. */
export const SHEET_BASE: Avatar = { skin: 1, hairColour: 2, eyes: 0, eyebrows: 1, mouth: 0, hair: 0, beard: 0, headwear: 0, accessory: 0, background: 0 };

/** The part names as the sheets title them. */
export const PART_TITLES: Record<AvatarPart, string> = {
  skin: "Skin tone",
  hairColour: "Hair colour",
  eyes: "Eyes",
  eyebrows: "Eyebrows",
  mouth: "Mouth",
  hair: "Hair",
  beard: "Beard",
  headwear: "Headwear",
  accessory: "Accessory",
  background: "Background",
};
