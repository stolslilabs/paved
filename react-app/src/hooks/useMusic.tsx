import { useState, useEffect } from "react";
import useSound from "use-sound";

// Define a type for your tracks
type Track = {
  name: string;
  url: string;
};

// Your tracks list
const tracks: Track[] = [{ name: "Rain Pool", url: "/RainPool.mp3" }];

export const useMusicPlayer = () => {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [trackName, setTrackName] = useState(tracks[0].name);
  const [isPlaying, setIsPlaying] = useState(false); // Added state to track if music is playing

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
    onplay: () => setIsPlaying(true), // Set isPlaying to true when the track starts playing
    onstop: () => setIsPlaying(false), // Set isPlaying to false when the track stops
    onend: () => {
      setIsPlaying(false); // Also set isPlaying to false when the track ends
      goToNextTrack();
    },
  });

  useEffect(() => {
    play();
    return () => stop();
  }, [currentTrackIndex, play, stop]);

  return { play, stop, trackName, next, isPlaying }; // Include checkIsPlaying in the returned object
};
