import { useEffect, useState } from "react";
import { loadAvatarKing, traitsText, type KingStills, type Traits } from "@paved/renderer";
import { cn } from "../../lib/utils";

/**
 * The village behind every avatar (the live bust's and the stills'), blurred by the renderer: one image in `public/avatar/`,
 * 512 px, the size it is drawn at.
 */
export const AVATAR_BACKDROP = "/avatar/backdrop.webp";

/**
 * The avatar's still image (issue 626, AVATAR-LIVING): the bust at rest, as the live one's first frame, rendered once by the
 * page's one still renderer (`KingStills`: one shared WebGL context released at rest, the renders one at a time with a task
 * between them), then from its cache. The menus never hold a live context per avatar. The rendering is a chunk of its own
 * (`loadAvatarKing`), fetched by the first still.
 */
let stills: KingStills | null = null;
let loading: Promise<KingStills> | null = null;

/** The page's one still renderer, once its chunk is loaded (null until then, or when it cannot load). */
function useKingStills(): KingStills | null {
  const [value, setValue] = useState(stills);
  useEffect(() => {
    if (value) return;
    let live = true;
    loading ??= loadAvatarKing().then((m) => (stills = new m.KingStills({ backdrop: AVATAR_BACKDROP })));
    loading.then(
      (s) => live && setValue(s),
      () => {
        // A failed chunk: the initial stays; the next still asks again.
        loading = null;
      },
    );
    return () => {
      live = false;
    };
  }, [value]);
  return value;
}

/** The device gave no WebGL context once: no still is tried again (each try costs a failed context and a console error). */
let noWebGL = false;

/** The image of some traits at a size: from the cache at once, else once rendered. Undefined until then, or without WebGL. */
export function useAvatarStill(traits: Traits | null, size: number): string | undefined {
  const renderer = useKingStills();
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
  className?: string;
}

/** The avatar's still image in its circle. */
export function AvatarStill({ traits, size, className }: AvatarStillProps) {
  const src = useAvatarStill(traits, size);
  return (
    <span data-slot="avatar-still" className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)} style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} className="block size-full" draggable={false} />}
    </span>
  );
}
