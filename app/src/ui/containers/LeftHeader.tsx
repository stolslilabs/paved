import { Scoreboard } from "../components/Scoreboard";
import { isMobile } from "react-device-detect"

export const LeftHeader = () => {

  return !isMobile && (
    <div className="z-20 flex flex-col p-2 absolute top-0 uppercase px-4 ">
      <Scoreboard />
    </div>
  )
};
