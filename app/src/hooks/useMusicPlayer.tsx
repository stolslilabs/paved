import { useMusicStore } from "@/store";
import pavedMusic from "/sounds/music/paved.m4a";
import villageConsort from "/sounds/music/village_consort.mp3";
import aleAndAnecdotes from "/sounds/music/ale_and_anecdotes.mp3";
import medievalBanquet from "/sounds/music/medieval_banquet.mp3";
import royalMarket from "/sounds/music/royal_market.wav";
import { Howl, Howler } from "howler";
import { useCallback, useEffect } from "react";

export const tracks = {
  ingame: new Map<string, Howl>([
    [
      "paved",
      new Howl({
        src: pavedMusic,
        volume: 0.1,
        html5: true,
        loop: true,
      }),
    ],
  ]),
  lobby: new Map<string, Howl>([
    [
      "village",
      new Howl({
        src: villageConsort,
        volume: 0.1,
        html5: true,
        onend: () => {
          const randomTrack = getRandomLobbyValue();
          randomTrack.play();
        },
      }),
    ],
    [
      "ale",
      new Howl({
        src: aleAndAnecdotes,
        volume: 0.1,
        html5: true,
        onend: () => {
          const randomTrack = getRandomLobbyValue();
          randomTrack.play();
        },
      }),
    ],
    [
      "banquet",
      new Howl({
        src: medievalBanquet,
        volume: 0.1,
        html5: true,
        onend: () => {
          const randomTrack = getRandomLobbyValue();
          randomTrack.play();
        },
      }),
    ],
    [
      "market",
      new Howl({
        src: royalMarket,
        volume: 0.1,
        html5: true,
        onend: () => {
          const randomTrack = getRandomLobbyValue();
          randomTrack.play();
        },
      }),
    ],
  ]),
};

const getRandomLobbyValue = (): Howl => {
  const lobbyValues = Array.from(tracks.lobby.values());
  const randomIndex = Math.floor(Math.random() * lobbyValues.length);
  return lobbyValues[randomIndex];
};

export const useMusicPlayer = () => {
  const volume = useMusicStore((state) => state.volume);
  const setVolume = useMusicStore((state) => state.setVolume);
  const track = useMusicStore((state) => state.track);
  const setTrack = useMusicStore((state) => state.setTrack);
  const muted = useMusicStore((state) => state.muted);
  const setMuted = useMusicStore((state) => state.setMuted);

  const play = {
    lobby: useCallback(() => {
      if (muted) return;

      const howl = getRandomLobbyValue();

      howl.on("play", () => {
        if (track) {
          track.stop();
        }

        setTrack(howl);
        setMuted(false);
      });

      howl.on("end", () => {
        setTrack(null);
      });

      Howler.stop();

      howl.play();
      console.log("playing");
    }, [setTrack, track, muted, setMuted]),
    ingame: useCallback(() => {
      const howl = tracks.ingame.get("paved");

      Howler.stop();

      howl?.play();
      console.log("playing");
    }, [setTrack]),
  };

  const stop = useCallback(() => {
    track?.stop();
    setTrack(null);
  }, [setTrack, track]);

  useEffect(() => {
    if (muted) {
      track?.stop();
      setTrack(null);
      Howler.stop();
    }
  }, [muted]);

  return {
    play,
    stop,
    track,
    volume,
    setVolume,
    muted,
    setMuted,
  };
};
