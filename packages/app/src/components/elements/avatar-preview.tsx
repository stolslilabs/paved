import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { Avatar, AvatarPreview, AvatarStyle } from "@paved/renderer";
import { cn } from "../../lib/utils";
import { AvatarStill, useAvatarRender } from "./avatar-still";

export interface AvatarPreview3DProps {
  avatar: Avatar;
  style?: AvatarStyle;
  autoTurn?: boolean;
  /** The square's side in CSS px; omitted, the class sizes it (one canvas across breakpoints: it follows its box). */
  size?: number;
  /** Frames drawn and draws, for a readout. */
  onStats?: (stats: { frames: number; draws: number }) => void;
  className?: string;
}

/**
 * The creator's live preview (#626): the page's one WebGL canvas, on the avatar's background; drag to turn it. It turns on
 * its own unless the player asks for reduced motion. Without WebGL it shows the still instead.
 */
export function AvatarPreview3D({ avatar, style = "voxel", autoTurn = true, size, onStats, className }: AvatarPreview3DProps) {
  const mod = useAvatarRender();
  const host = useRef<HTMLDivElement>(null);
  const preview = useRef<AvatarPreview | null>(null);
  const [failed, setFailed] = useState(false);
  const first = useRef({ avatar, style, autoTurn });
  first.current = { avatar, style, autoTurn };

  useEffect(() => {
    if (!mod || !host.current) return;
    let p: AvatarPreview;
    try {
      p = new mod.AvatarPreview(host.current, first.current.avatar, { style: first.current.style, autoTurn: first.current.autoTurn });
    } catch {
      setFailed(true);
      return;
    }
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

  // The background drawn once per background, not per frame of the parent.
  const backdrop = useMemo<CSSProperties | undefined>(
    () => (mod ? { backgroundImage: `url(${mod.backgroundUrl(avatar.background, 64)})`, backgroundSize: "cover", imageRendering: "pixelated" } : undefined),
    [mod, avatar.background],
  );
  if (failed) return <AvatarStill avatar={avatar} size={size ?? 208} style={style} className={className} />;
  return (
    <div
      ref={host}
      data-slot="avatar-preview"
      aria-label="Avatar preview: drag to turn"
      role="img"
      className={cn("shrink-0 overflow-hidden rounded-full bg-muted", className)}
      style={size === undefined ? backdrop : { width: size, height: size, ...backdrop }}
    />
  );
}
