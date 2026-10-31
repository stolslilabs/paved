import { useEffect, useMemo, useRef, useState } from "react";
import { decodeTraits, loadAvatarKing, traitsText, type KingAvatar, type Traits } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { AVATAR_BACKDROP } from "./avatar-still";

export interface LiveAvatarProps {
  traits: Traits;
  className?: string;
}

/**
 * The living avatar (AVATAR-LIVING): the bust on the blurred village, breathing, glancing and blinking, its head following the
 * cursor on a desktop (never on a touch screen, never under reduced motion, where it stands still). One WebGL context: the
 * home's badge and the creator only; every other avatar is a still. It fills its box and follows its size; off screen it draws
 * nothing. Without WebGL the box stays as it is (the initial or the disc under it).
 */
export function LiveAvatar({ traits, className }: LiveAvatarProps) {
  const host = useRef<HTMLDivElement>(null);
  const avatar = useRef<KingAvatar | null>(null);
  const [failed, setFailed] = useState(false);
  const first = useRef(traits);
  first.current = traits;

  useEffect(() => {
    let gone = false;
    loadAvatarKing().then(
      (m) => {
        if (gone || !host.current) return;
        try {
          avatar.current = new m.KingAvatar(host.current, { backdrop: AVATAR_BACKDROP, traits: first.current });
        } catch {
          setFailed(true);
        }
      },
      () => setFailed(true),
    );
    return () => {
      gone = true;
      avatar.current?.dispose();
      avatar.current = null;
    };
  }, []);
  // Keyed on the traits' text: a parent that builds the same traits again each render rebuilds nothing.
  const key = traitsText(traits);
  useEffect(() => {
    avatar.current?.setTraits(traits);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands for `traits`
  }, [key]);
  if (failed) return null;
  return <div ref={host} data-slot="live-avatar" role="img" aria-label="Your avatar" className={cn("overflow-hidden rounded-full", className)} />;
}

/** A saved look, living: the home's badge (its own chunk, loaded only for a player who saved one). */
export default function LiveSavedAvatar({ look, className }: { look: bigint; className?: string }) {
  const traits = useMemo(() => decodeTraits(look), [look]);
  return <LiveAvatar traits={traits} className={className} />;
}
