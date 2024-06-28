import { Actions } from "./Actions";
import { Hand } from "./Hand";
import { LeftHeader } from "../containers/LeftHeader";
import { Characters } from "./Characters";
import { useGameStore } from "@/store";
import { isMobile } from "react-device-detect"
import { MobileActions } from "./MobileActions";

export const Overlay = () => {
  // Reset hovered tile when mouse enters overlay
  const { resetHoveredTile } = useGameStore();
  return (
    <div onMouseEnter={() => resetHoveredTile()}>
      <LeftHeader />
      {isMobile ? <MobileActions /> : <Actions />}
      <Hand />
      <Characters />
    </div>
  );
};
