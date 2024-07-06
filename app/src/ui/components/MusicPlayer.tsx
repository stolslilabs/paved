import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { Play, Pause } from "lucide-react";
import { Button } from "@/ui/elements/button";
import { Slider } from "@/ui/elements/slider";

export const MusicPlayer = () => {
  const { volume, setVolume, setMuted, muted } = useMusicPlayer();

  const mute = () => {
    setMuted(true)
  }

  const unmute = () => {
    setMuted(false)
  }

  return (
    <>
      <div className="flex space-x-3 rounded-md p-2  z-1  ">
        <Button
          onClick={!muted ? mute : unmute}
          className="self-center rounded-full"
          size={"sm"}
        >
          {!muted ? (
            <Pause className="fill-transparent w-4" />
          ) : (
            <Play className="fill-transparent  w-4" />
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
