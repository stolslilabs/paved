import { useMusicPlayer } from "@/hooks/useMusic";
import { Play, Pause, Forward } from "lucide-react";
import { Button } from "@/ui/elements/button";
import { Slider } from "@/ui/elements/slider";

export const MusicPlayer = () => {
  const { play, next, trackName, isPlaying, stop, volume, setVolume } =
    useMusicPlayer();

  const handlePlay = () => {
    if (isPlaying) {
      stop();
    } else {
      play();
    }
  };

  return (
    <>
      <div className="flex space-x-3 rounded-md p-2  z-1  ">
        <Button
          onClick={() => handlePlay()}
          // variant={"link"}
          className="self-center"
          size={"sm"}
        >
          {isPlaying ? (
            <Pause className="fill-transparent " />
          ) : (
            <Play className="fill-transparent " />
          )}
        </Button>

        <Slider
          className="w-12"
          onValueChange={(value) => setVolume(value[0])}
          defaultValue={[volume]}
          max={1}
          step={0.1}
        />
      </div>
    </>
  );
};
