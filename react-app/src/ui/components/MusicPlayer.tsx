import { useMusicPlayer } from "@/hooks/useMusic";
import { Play, Pause, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";

export const MusicPlayer = () => {
  const { play, next, trackName, isPlaying, stop } = useMusicPlayer();

  const handlePlay = () => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  };

  return (
    <>
      <div className="flex space-x-3 rounded-md p-2 backdrop-blur-lg z-1 border  text-white">
        <Button
          onClick={() => handlePlay()}
          variant={"link"}
          className="self-center"
          size={"sm"}
        >
          {isPlaying ? (
            <Pause className="fill-transparent stroke-white" />
          ) : (
            <Play className="fill-transparent stroke-white" />
          )}
        </Button>

        <div className="self-center sm:w-48">{trackName}</div>

        <Button
          onClick={() => next()}
          variant={"ghost"}
          className="self-center "
          size={"sm"}
        >
          <Forward className="stroke-white" />
        </Button>
      </div>
    </>
  );
};
