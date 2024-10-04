import { useMusicPlayer } from "@/hooks/useMusicPlayer";
import { Button } from "@/ui/elements/button";
import soundOffIcon from "/assets/icons/sound-off.svg";
import soundOnIcon from "/assets/icons/sound-on.svg";

export const MusicPlayer = () => {
  const { setMuted, muted } = useMusicPlayer();

  const mute = () => {
    setMuted(true);
  };

  const unmute = () => {
    setMuted(false);
  };

  return (
    <Button
      onClick={!muted ? mute : unmute}
      className="self-center rounded-full p-0 size-auto bg-[#686868] hover:bg-[#686868] border-[#686868] cursor-pointer"
      asChild
    >
      {!muted ? (
        <img src={soundOffIcon} className="fill-transparent w-8" />
      ) : (
        <img src={soundOnIcon} className="fill-transparent w-8" />
      )}
    </Button>
  );
};
