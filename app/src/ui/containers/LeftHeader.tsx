import { isMobile } from "react-device-detect";
import { Scoreboard } from "../components/Scoreboard";

export const LeftHeader = () => {
  return (
    <div className={`w-full z-20 flex flex-col p-2 absolute top-0 uppercase px-4 items-center ${!isMobile && "sm:items-start"}`}>
      <Scoreboard />
    </div>
  );
};
