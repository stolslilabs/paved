import { MusicPlayer } from "../components/MusicPlayer";
import { Scoreboard } from "../components/Scoreboard";

export const LeftHeader = () => {
  return (
    <div className="z-20 flex flex-col p-4 absolute top-0 left-0 uppercase px-4 text-black">
      <MusicPlayer />
      <Scoreboard />
    </div>
  );
};
