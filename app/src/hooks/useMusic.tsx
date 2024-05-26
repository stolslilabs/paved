import { useUIStore } from "@/store";
import { useState, useEffect } from "react";
import useSound from "use-sound";

// Define a type for your tracks
export type Track = {
  name: string;
  url: string;
};

// Your tracks list
export const tracks: Track[] = [{ name: "Paved", url: "/paved.m4a" }];

export const useMusicPlayer = () => {
  const volume = useUIStore((state) => state.volume);
  const isPlaying = useUIStore((state) => state.isPlaying);
  const setIsPlaying = useUIStore((state) => state.setIsPlaying);
  const track = useUIStore((state) => state.track);
  const setTrack = useUIStore((state) => state.setTrack);
  const setVolume = useUIStore((state) => state.setVolume);

  // const goToNextTrack = () => {
  //   setTrack(tracks[0].name);
  // };

  // const next = () => {
  //   goToNextTrack();
  // };

  return {
    stop,
    track,
    // next,
    isPlaying,
    volume,
    setIsPlaying,
    setVolume,
  };
};
