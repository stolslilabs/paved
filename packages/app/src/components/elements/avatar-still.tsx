import { useEffect, useState } from "react";
import { loadAvatarKing, traitsText, type BackdropUrl, type KingStills, type Traits } from "@paved/renderer";
import { cn } from "../../lib/utils";

/**
 * The scene behind an avatar (the live bust's and the stills'), the backdrop trait's, blurred by the renderer: one image a scene
 * in `public/avatar/backdrops/`, 512 px, the size it is drawn at.
 */
export const avatarBackdrop: BackdropUrl = (name) => `/avatar/backdrops/${name}.webp`;

/**
 * What a still stands on: its backdrop trait's scene (the menus'), or a plain ground, the drawer's carved charcoal (`--card`; AVATAR-PAGE,
 * the owner's ask of 2026-11-06: the editor's options show the trait, not the scene).
 */
export type StillGround = "scene" | "plain";

/** The plain ground as an image (the renderer takes a backdrop's URL): a few pixels of `--card`, read from the theme at first use. */
let plainGround: string | null = null;
const plainBackdrop: BackdropUrl = () => {
  if (plainGround) return plainGround;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 4;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--card").trim();
    ctx.fillRect(0, 0, 4, 4);
  }
  return (plainGround = canvas.toDataURL("image/png"));
};

/**
 * The avatar's still image (issue 626, AVATAR-LIVING): the bust at rest, as the live one's first frame, rendered once by the
 * page's still renderer of its ground (`KingStills`: one shared WebGL context released at rest, the renders one at a time with a task
 * between them), then from its cache. The menus never hold a live context per avatar. The rendering is a chunk of its own
 * (`loadAvatarKing`), fetched by the first still.
 */
const renderers: Partial<Record<StillGround, KingStills>> = {};
const loadings: Partial<Record<StillGround, Promise<KingStills>>> = {};

/** The page's still renderer of a ground, once its chunk is loaded (null until then, or when it cannot load). */
function useKingStills(ground: StillGround): KingStills | null {
  const [value, setValue] = useState(renderers[ground] ?? null);
  useEffect(() => {
    if (value) return;
    let live = true;
    const loading = (loadings[ground] ??= loadAvatarKing().then((m) => (renderers[ground] = new m.KingStills({ backdrops: ground === "plain" ? plainBackdrop : avatarBackdrop }))));
    loading.then(
      (s) => live && setValue(s),
      () => {
        // A failed chunk: the initial stays; the next still asks again.
        delete loadings[ground];
      },
    );
    return () => {
      live = false;
    };
  }, [value, ground]);
  return value;
}

/** The device gave no WebGL context once: no still is tried again (each try costs a failed context and a console error). */
let noWebGL = false;

/** The image of some traits at a size: from the cache at once, else once rendered. Undefined until then, or without WebGL. */
export function useAvatarStill(traits: Traits | null, size: number, ground: StillGround = "scene"): string | undefined {
  const renderer = useKingStills(ground);
  const [src, setSrc] = useState(() => (renderer && traits ? renderer.peek(traits, { size }) : undefined));
  // Keyed on the traits' text, not the object: a parent that builds the same traits again each render asks for no new image.
  const key = traits ? traitsText(traits) : null;
  useEffect(() => {
    if (!renderer || !traits || noWebGL) return setSrc(undefined);
    const cached = renderer.peek(traits, { size });
    setSrc(cached);
    if (cached !== undefined) return;
    let live = true;
    renderer.get(traits, { size }).then(
      (url) => live && setSrc(url),
      // No WebGL (an old device, a test's DOM): the disc stays as it is.
      () => (noWebGL = true),
    );
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `traits`
  }, [renderer, key, size]);
  return src;
}

export interface AvatarStillProps {
  traits: Traits;
  /** CSS px: 40, 64 or 128 in the menus. */
  size: number;
  /** What it stands on: its scene (the menus'), or the plain ground (the editor's options). */
  ground?: StillGround;
  className?: string;
}

/** The avatar's still image in its circle. */
export function AvatarStill({ traits, size, ground, className }: AvatarStillProps) {
  const src = useAvatarStill(traits, size, ground);
  return (
    <span data-slot="avatar-still" className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)} style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} className="block size-full" draggable={false} />}
    </span>
  );
}
