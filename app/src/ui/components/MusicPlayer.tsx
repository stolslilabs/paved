import { useMusicPlayer } from "@/hooks/useMusic";
import { Play, Pause, Forward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

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

        <Slider
          onValueChange={(value) => setVolume(value[0])}
          defaultValue={[volume]}
          max={1}
          step={0.1}
        />
      </div>
    </>
  );
};
