import { Actions } from "../containers/Actions";
import { Hand } from "../containers/Hand";
import { LeftHeader } from "../containers/LeftHeader";
import { RightHeader } from "../containers/RightHeader";
import { Characters } from "../containers/Characters";
import { useGameStore } from "@/store";

export const Overlay = () => {
  // Reset hovered tile when mouse enters overlay
  const { resetHoveredTile } = useGameStore();
  return (
    <div onMouseEnter={() => resetHoveredTile()}>
      <LeftHeader />
      <RightHeader />
      <Actions />
      <Hand />
      <Characters />
    </div>
  );
};
