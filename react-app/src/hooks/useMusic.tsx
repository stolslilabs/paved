import { useState, useEffect } from "react";
import useSound from "use-sound";

// Define a type for your tracks
type Track = {
  name: string;
  url: string;
};

// Your tracks list
const tracks: Track[] = [{ name: "Paved", url: "/paved.m4a" }];

export const useMusicPlayer = () => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackName, setTrackName] = useState(tracks[0].name);
  const [isPlaying, setIsPlaying] = useState(false); // Added state to track if music is playing
  const [volume, setVolume] = useState(0.2); // Added state to track volume

  const goToNextTrack = () => {
    setCurrentTrackIndex((prevIndex) => {
      const nextIndex = (prevIndex + 1) % tracks.length;
      setTrackName(tracks[nextIndex].name);
      return nextIndex;
    });
  };

  const next = () => {
    goToNextTrack();
    play();
  };

  const [play, { stop }] = useSound(tracks[currentTrackIndex].url, {
    volume,
    onplay: () => setIsPlaying(true),
    onstop: () => setIsPlaying(false),
    onend: () => {
      setIsPlaying(false);
      goToNextTrack();
    },
  });

  useEffect(() => {
    play();
    return () => stop();
  }, [currentTrackIndex, play, stop]);

  return { play, stop, trackName, next, isPlaying, volume, setVolume };
};
