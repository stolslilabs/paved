import { useUIStore } from "@/store";

export type Track = {
  name: string;
  url: string;
};

export const tracks: Track[] = [{ name: "Paved", url: "/paved.m4a" }];

export const useMusicPlayer = () => {
  const volume = useUIStore((state) => state.volume);
  const isPlaying = useUIStore((state) => state.isPlaying);
  const setIsPlaying = useUIStore((state) => state.setIsPlaying);
  const track = useUIStore((state) => state.track);
  const setVolume = useUIStore((state) => state.setVolume);

  return {
    stop,
    track,
    isPlaying,
    volume,
    setIsPlaying,
    setVolume,
  };
};
