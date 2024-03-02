import { MusicPlayer } from "../components/MusicPlayer";
import { Scoreboard } from "../components/Scoreboard";

export const LeftHeader = () => {
  return (
    <div className="z-20 flex justify-between items-center absolute top-0 left-0 uppercase px-4 text-black flex-col p-4">
      <MusicPlayer />

      <Scoreboard />
    </div>
  );
};
