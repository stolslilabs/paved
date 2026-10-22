import { useEffect, useState } from "react";
import { avatarKey, loadAvatarRender, type Avatar, type AvatarStillOptions, type AvatarStyle } from "@paved/renderer";
import { cn } from "../../lib/utils";

/**
 * The avatar's still image (#626): rendered once by the page's one still renderer (`avatarStills`, one shared WebGL context
 * released at rest), then from its cache. The menus never hold a live context per avatar. The rendering is a chunk of its
 * own (`loadAvatarRender`), fetched by the first still.
 */
type RenderModule = Awaited<ReturnType<typeof loadAvatarRender>>;

let loaded: RenderModule | null = null;
let loading: Promise<RenderModule> | null = null;

/** The avatar's rendering chunk, once loaded (null until then, or when it cannot load). */
export function useAvatarRender(): RenderModule | null {
  const [mod, setMod] = useState(loaded);
  useEffect(() => {
    if (mod) return;
    let live = true;
    loading ??= loadAvatarRender().then((m) => (loaded = m));
    loading.then(
      (m) => live && setMod(m),
      () => {
        // A failed chunk: the initial stays; the next still asks again.
        loading = null;
      },
    );
    return () => {
      live = false;
    };
  }, [mod]);
  return mod;
}

/** The longest a batch of renders holds the main thread before it yields (a grid of swatches asks for many at once). */
const SLICE_MS = 8;
const queue: (() => void)[] = [];
/** The device gave no WebGL context once: no still is tried again (each try costs a failed context and a console error). */
let noWebGL = false;
let draining = false;

/** Runs the queued renders a slice at a time, a task each, so a tap is never kept waiting behind a whole grid. */
function drain() {
  const start = performance.now();
  while (queue.length > 0 && performance.now() - start < SLICE_MS) queue.shift()!();
  if (queue.length > 0) setTimeout(drain, 0);
  else draining = false;
}

/** Queues a render; the returned function takes it back (an unmounted still renders nothing). */
function schedule(render: () => void): () => void {
  queue.push(render);
  if (!draining) {
    draining = true;
    setTimeout(drain, 0);
  }
  return () => {
    const at = queue.indexOf(render);
    if (at >= 0) queue.splice(at, 1);
  };
}

/** The image of an avatar: from the cache at once, else rendered in the queue. Undefined until then, or without WebGL. */
export function useAvatarStill(avatar: Avatar | null, options: AvatarStillOptions): string | undefined {
  const mod = useAvatarRender();
  const { size, style, background } = options;
  const peek = () => (mod && avatar ? mod.avatarStills.peek(avatar, { size, style, background }) : undefined);
  const [src, setSrc] = useState(peek);
  // Keyed on the look, not the object: a parent that builds the same avatar again each render asks for no new image.
  const key = avatar ? avatarKey(avatar) : null;
  useEffect(() => {
    if (!mod || !avatar || noWebGL) return setSrc(undefined);
    const cached = mod.avatarStills.peek(avatar, { size, style, background });
    setSrc(cached);
    if (cached !== undefined) return;
    return schedule(() => {
      if (noWebGL) return;
      try {
        setSrc(mod.avatarStills.get(avatar, { size, style, background }));
      } catch {
        // No WebGL (an old device, a test's DOM): the disc stays as it is.
        noWebGL = true;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `avatar`
  }, [mod, key, size, style, background]);
  return src;
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

/** The avatar's still image in its circle. */
export function AvatarStill({ avatar, size, style = "voxel", background = true, className }: AvatarStillProps) {
  const src = useAvatarStill(avatar, { size, style, background });
  return (
    <span data-slot="avatar-still" className={cn("block shrink-0 overflow-hidden rounded-full bg-muted", className)} style={{ width: size, height: size }}>
      {src && <img src={src} alt="" width={size} height={size} className="block size-full" draggable={false} />}
    </span>
  );
}
