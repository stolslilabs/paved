import type { ReactElement } from "react";
import { Plan, getTilePath } from "@paved/game-core";

export interface TilePreviewProps {
  tilePlan: number;
  orientation: number;
  size?: number;
}

export function TilePreview({ tilePlan, orientation, size = 80 }: TilePreviewProps): ReactElement | null {
  if (tilePlan === 0) return null;

  const plan = Plan.from(tilePlan);
  const src = getTilePath(plan.value);
  const rotation = (orientation - 1) * 90;

  return (
    <img
      src={src}
      alt="Current tile"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        transform: `rotate(${rotation}deg)`,
        borderRadius: 8,
        border: "2px solid rgba(255,255,255,0.2)",
      }}
    />
  );
}
